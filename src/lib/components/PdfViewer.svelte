<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { appDataDir, join } from '@tauri-apps/api/path';
	import { convertFileSrc } from '@tauri-apps/api/core';
	import { readFile } from '@tauri-apps/plugin-fs';
	import type { Pdf, PdfAnnotation } from '$lib/types';

	let {
		pdf,
		annotations = [],
		onclose,
		oncreateannotation,
		ondeleteannotation,
		onupdateannotation
	}: {
		pdf: Pdf;
		annotations?: PdfAnnotation[];
		onclose: () => void;
		oncreateannotation: (pdfId: number, page: number, color: string, rectsJson: string, text: string, comment: string) => void;
		ondeleteannotation: (id: number) => void;
		onupdateannotation: (id: number, color: string, comment: string) => void;
	} = $props();

	let pdfDoc: any = null;
	let currentPage = $state(1);
	let totalPages = $state(0);
	let scale = $state(1.5);
	let canvasContainer = $state<HTMLDivElement | null>(null);
	let rendering = $state(false);
	let loaded = $state(false);

	// Highlight mode state
	let highlightMode = $state(false);
	let activeHighlightColor = $state('#FDE047');

	// Comment sidebar state
	let editingAnnotationId = $state<number | null>(null);
	let commentDraft = $state('');

const HIGHLIGHT_COLORS = [
    { value: '#FDE047', label: 'Sonnengelb' },   // Sehr hell, klassischer Marker
    { value: '#2DD4BF', label: 'Türkis' },      // Unterscheidet sich deutlich von Blau und Grün
    { value: '#38BDF8', label: 'Himmelblau' },  // Hell genug, um nicht mit Lila verwechselt zu werden
    { value: '#FB7185', label: 'Lachsrosa' },   // Hat hohen Weißanteil, klarer Kontrast zu Grün
	{ value: '#A855F7', label: 'Amethyst' }, // Das dunklere, kräftigere Lila    
 	{ value: '#FB923C', label: 'Pastellorange' } // Warmer Ton als Brücke
];

	let pageAnnotations = $derived(
		annotations
			.filter((a) => a.page_number === currentPage)
			.sort((a, b) => {
				const aRects = JSON.parse(a.rects_json) as { x: number; y: number; w: number; h: number }[];
				const bRects = JSON.parse(b.rects_json) as { x: number; y: number; w: number; h: number }[];
				const aY = Math.min(...aRects.map((r) => r.y));
				const bY = Math.min(...bRects.map((r) => r.y));
				if (aY !== bY) return aY - bY;
				const aX = Math.min(...aRects.map((r) => r.x));
				const bX = Math.min(...bRects.map((r) => r.x));
				return aX - bX;
			})
	);

	// Reload PDF when the pdf prop changes (including initial mount)
	$effect(() => {
		const _id = pdf.id; // Track pdf changes
		// Reset state
		currentPage = 1;
		totalPages = 0;
		loaded = false;
		pdfDoc = null;
		highlightMode = false;
		editingAnnotationId = null;
		commentDraft = '';
		// Reload
		loadPdf();
	});

	async function loadPdf() {
		try {
			const pdfjsLib = await import('pdfjs-dist');
			pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
				'pdfjs-dist/build/pdf.worker.min.mjs',
				import.meta.url
			).href;

			const dataDir = await appDataDir();
			const filePath = await join(dataDir, 'pdfs', pdf.stored_name);
			const fileData = await readFile(filePath);

			pdfDoc = await pdfjsLib.getDocument({ data: fileData }).promise;
			totalPages = pdfDoc.numPages;
			loaded = true;
			await renderPage();
		} catch (err) {
			console.error('PDF load error:', err);
		}
	}

	async function renderPage() {
		if (!pdfDoc || !canvasContainer || rendering) return;
		rendering = true;

		try {
			const page = await pdfDoc.getPage(currentPage);
			const dpr = window.devicePixelRatio || 1;

			// Two viewports: CSS (layout + TextLayer) and render (hi-res canvas bitmap)
			const cssViewport = page.getViewport({ scale });
			const renderViewport = page.getViewport({ scale: scale * dpr });

			const cssWidth = Math.round(cssViewport.width);
			const cssHeight = Math.round(cssViewport.height);

			// Clear container
			canvasContainer.innerHTML = '';

			// Create canvas — bitmap at device resolution, CSS size at logical resolution
			const canvas = document.createElement('canvas');
			canvas.width = Math.round(renderViewport.width);
			canvas.height = Math.round(renderViewport.height);
			canvas.style.width = `${cssWidth}px`;
			canvas.style.height = `${cssHeight}px`;
			canvas.className = 'pdf-canvas';

			const wrapper = document.createElement('div');
			wrapper.className = 'pdf-page-wrapper';
			wrapper.style.width = `${cssWidth}px`;
			wrapper.style.height = `${cssHeight}px`;
			wrapper.style.position = 'relative';
			wrapper.appendChild(canvas);

			// Render PDF to canvas at device resolution
			const ctx = canvas.getContext('2d')!;
			await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;

			// Create text layer for selection — uses CSS viewport (logical pixels)
			const textContent = await page.getTextContent();
			const textLayerDiv = document.createElement('div');
			textLayerDiv.className = 'textLayer';
			textLayerDiv.style.setProperty('--total-scale-factor', String(cssViewport.scale));

			const pdfjsLib = await import('pdfjs-dist');
			const textLayer = new pdfjsLib.TextLayer({
				textContentSource: textContent,
				container: textLayerDiv,
				viewport: cssViewport
			});
			await textLayer.render();

			textLayerDiv.style.width = `${cssWidth}px`;
			textLayerDiv.style.height = `${cssHeight}px`;

			wrapper.appendChild(textLayerDiv);

			// Create annotation overlay
			const annotationOverlay = document.createElement('div');
			annotationOverlay.className = 'pdf-annotation-overlay';
			annotationOverlay.style.width = `${cssWidth}px`;
			annotationOverlay.style.height = `${cssHeight}px`;
			wrapper.appendChild(annotationOverlay);

			canvasContainer.appendChild(wrapper);
			const dims = { width: cssWidth, height: cssHeight };
			renderAnnotationOverlay(annotationOverlay, dims);

			// Tooltip-Element für Annotation-Kommentare
			const tooltip = document.createElement('div');
			tooltip.className = 'pdf-annotation-tooltip';
			wrapper.appendChild(tooltip);

			wrapper.addEventListener('mousemove', (e) => {
				const currentOverlay = wrapper.querySelector('.pdf-annotation-overlay');
				if (!currentOverlay) return;
				const highlights = currentOverlay.querySelectorAll('.pdf-highlight[data-comment]');
				let found: Element | null = null;
				for (const h of highlights) {
					const r = h.getBoundingClientRect();
					if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
						found = h;
						break;
					}
				}
				if (found) {
					const wRect = wrapper.getBoundingClientRect();
					tooltip.textContent = (found as HTMLElement).dataset.comment ?? '';
					tooltip.style.display = 'block';
					tooltip.style.left = `${e.clientX - wRect.left + 14}px`;
					tooltip.style.top = `${e.clientY - wRect.top - 8}px`;
				} else {
					tooltip.style.display = 'none';
				}
			});

			wrapper.addEventListener('mouseleave', () => {
				tooltip.style.display = 'none';
			});

			// Listen for text selection
			textLayerDiv.addEventListener('mouseup', (e) => handleTextSelection(e, dims));
		} catch (err) {
			console.error('Render error:', err);
		}

		rendering = false;
	}

	function renderAnnotationOverlay(overlay: HTMLDivElement, dims: { width: number; height: number }) {
		overlay.innerHTML = '';
		for (const ann of pageAnnotations) {
			const rects = mergeRects(JSON.parse(ann.rects_json) as { x: number; y: number; w: number; h: number }[]);
			// Group all rects of one annotation under a single element so opacity
			// is applied once — prevents overlapping rects from compounding opacity.
			for (const rect of rects) {
				const div = document.createElement('div');
				div.className = 'pdf-highlight';
				div.style.left = `${rect.x * dims.width}px`;
				div.style.top = `${rect.y * dims.height}px`;
				div.style.width = `${rect.w * dims.width}px`;
				div.style.height = `${rect.h * dims.height}px`;
				div.style.backgroundColor = ann.color + '50';
				div.style.borderBottom = `1px solid ${ann.color}`;
				if (ann.comment) div.dataset.comment = ann.comment;
				overlay.appendChild(div);
			}
		}
	}

	function rectsOverlap(
		a: { x: number; y: number; w: number; h: number },
		b: { x: number; y: number; w: number; h: number }
	): boolean {
		return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
	}

	function mergeRects(rects: { x: number; y: number; w: number; h: number }[]) {
		if (rects.length <= 1) return rects;
		const sorted = [...rects].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
		const merged: { x: number; y: number; w: number; h: number }[] = [{ ...sorted[0] }];
		for (let i = 1; i < sorted.length; i++) {
			const r = sorted[i];
			const last = merged[merged.length - 1];
			const overlapY = r.y < last.y + last.h && r.y + r.h > last.y;
			if (overlapY) {
				const x1 = Math.min(last.x, r.x);
				const y1 = Math.min(last.y, r.y);
				const x2 = Math.max(last.x + last.w, r.x + r.w);
				const y2 = Math.max(last.y + last.h, r.y + r.h);
				merged[merged.length - 1] = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
			} else {
				merged.push({ ...r });
			}
		}
		return merged;
	}

	function handleTextSelection(e: MouseEvent, dims: { width: number; height: number }) {
		if (!highlightMode) return;

		const selection = window.getSelection();
		if (!selection || selection.isCollapsed || !selection.toString().trim()) return;

		const text = selection.toString().trim();
		const range = selection.getRangeAt(0);
		const rects = Array.from(range.getClientRects());
		const wrapper = canvasContainer?.querySelector('.pdf-page-wrapper');
		if (!wrapper) return;
		const wrapperRect = wrapper.getBoundingClientRect();

		// Normalize rects to 0-1 range relative to wrapper dimensions, then merge overlapping ones
		const normalizedRects = mergeRects(rects.map((r) => ({
			x: (r.left - wrapperRect.left) / wrapperRect.width,
			y: (r.top - wrapperRect.top) / wrapperRect.height,
			w: r.width / wrapperRect.width,
			h: r.height / wrapperRect.height
		})));

		const hasOverlap = pageAnnotations.some((ann) => {
			const existingRects = JSON.parse(ann.rects_json) as { x: number; y: number; w: number; h: number }[];
			return normalizedRects.some((nr) => existingRects.some((er) => rectsOverlap(nr, er)));
		});
		if (hasOverlap) {
			window.getSelection()?.removeAllRanges();
			return;
		}

		oncreateannotation(pdf.id, currentPage, activeHighlightColor, JSON.stringify(normalizedRects), text, '');
		window.getSelection()?.removeAllRanges();
	}

	async function goToPage(page: number) {
		if (page < 1 || page > totalPages || page === currentPage) return;
		currentPage = page;
		editingAnnotationId = null;
		await tick();
		await renderPage();
	}

	async function adjustZoom(delta: number) {
		scale = Math.max(0.5, Math.min(3, scale + delta));
		await renderPage();
	}

	// Re-render annotations when they change
	$effect(() => {
		void pageAnnotations; // explicit dependency — ensures effect re-runs when annotations change
		if (loaded && canvasContainer) {
			const overlay = canvasContainer.querySelector('.pdf-annotation-overlay') as HTMLDivElement;
			const wrapper = canvasContainer.querySelector('.pdf-page-wrapper') as HTMLDivElement;
			if (overlay && wrapper) {
				const dims = {
					width: wrapper.clientWidth,
					height: wrapper.clientHeight
				};
				renderAnnotationOverlay(overlay, dims);
			}
		}
	});
</script>

<div class="pdf-viewer">
	<div class="pdf-header">
		<button class="pdf-close-btn" onclick={onclose} title="Zurück">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="15 18 9 12 15 6"/>
			</svg>
		</button>
		<span class="pdf-title" title={pdf.filename}>{pdf.title || pdf.filename}</span>
		<div class="pdf-controls">
			<button class="ctrl-btn" onclick={() => adjustZoom(-0.25)} title="Verkleinern">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
			</button>
			<span class="zoom-label">{Math.round(scale * 100)}%</span>
			<button class="ctrl-btn" onclick={() => adjustZoom(0.25)} title="Vergrößern">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
			</button>
			<div class="page-nav">
				<button class="ctrl-btn" onclick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
				</button>
				<span class="page-label">{currentPage} / {totalPages}</span>
				<button class="ctrl-btn" onclick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages}>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 6 15 12 9 18"/></svg>
				</button>
			</div>
		</div>
	</div>

	<div class="pdf-body">
		<!-- Highlight mode toggle button -->
		<button
			class="highlight-toggle-btn"
			class:active={highlightMode}
			onclick={() => (highlightMode = !highlightMode)}
			title={highlightMode ? 'Highlight-Modus aus' : 'Highlight-Modus an'}
		>
			<svg width="16" height="16" viewBox="0 0 24 24" fill={highlightMode ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
			</svg>
		</button>

		{#if highlightMode}
			<div class="highlight-palette">
				{#each HIGHLIGHT_COLORS as color (color.value)}
					<button
						class="palette-color-btn"
						class:active={activeHighlightColor === color.value}
						style="background: {color.value}"
						title={color.label}
						onclick={() => (activeHighlightColor = color.value)}
					></button>
				{/each}
			</div>
		{/if}

		<div class="pdf-main">
			<div class="pdf-content" bind:this={canvasContainer}>
				{#if !loaded}
					<div class="pdf-loading">PDF wird geladen...</div>
				{/if}
			</div>

		</div>

		{#if pageAnnotations.length > 0}
			<aside class="pdf-annotations-sidebar">
				<div class="annotations-sidebar-header">
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
					<span>Annotationen (S. {currentPage})</span>
				</div>
				{#each pageAnnotations as ann (ann.id)}
					<div class="annotation-sidebar-item">
						<div class="annotation-color-dot" style="background: {ann.color}"></div>
						<div class="annotation-sidebar-body">
							<div class="annotation-sidebar-quote">
								"{ann.selected_text.slice(0, 100)}{ann.selected_text.length > 100 ? '...' : ''}"
							</div>
							{#if editingAnnotationId === ann.id}
								<textarea
									class="annotation-comment-input"
									bind:value={commentDraft}
									rows="3"
									placeholder="Kommentar eingeben..."
								></textarea>
								<div class="annotation-edit-actions">
									<button class="annotation-save-btn" onclick={() => {
										onupdateannotation(ann.id, ann.color, commentDraft.trim());
										editingAnnotationId = null;
									}}>Speichern</button>
									<button class="annotation-cancel-btn" onclick={() => (editingAnnotationId = null)}>Abbrechen</button>
								</div>
							{:else}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<div class="annotation-comment-preview" onclick={() => {
									commentDraft = ann.comment ?? '';
									editingAnnotationId = ann.id;
								}}>
									{#if ann.comment}
										{ann.comment}
									{:else}
										<span class="comment-placeholder">Kommentar hinzufügen...</span>
									{/if}
								</div>
							{/if}
						</div>
						<button class="annotation-delete-btn" onclick={() => ondeleteannotation(ann.id)} title="Löschen">
							<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
						</button>
					</div>
				{/each}
			</aside>
		{/if}
	</div>
</div>

<style>
	.pdf-viewer {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--bg);
		border-left: 1px solid var(--gray-200);
		min-width: 350px;
	}

	.pdf-header {
		padding: 10px 16px;
		border-bottom: 1px solid var(--gray-200);
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--gray-50);
		flex-shrink: 0;
	}

	.pdf-close-btn {
		width: 28px;
		height: 28px;
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--gray-400);
		flex-shrink: 0;
		transition: all var(--transition-fast);
	}

	.pdf-close-btn:hover {
		background: var(--gray-200);
		color: var(--gray-700);
	}

	.pdf-title {
		flex: 1;
		font-size: 13px;
		font-weight: 600;
		color: var(--gray-700);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.pdf-controls {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}

	.ctrl-btn {
		width: 26px;
		height: 26px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--gray-200);
		background: var(--bg);
		color: var(--gray-500);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all var(--transition-fast);
	}

	.ctrl-btn:hover:not(:disabled) {
		background: var(--gray-100);
		color: var(--gray-700);
	}

	.ctrl-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.zoom-label, .page-label {
		font-size: 11px;
		color: var(--gray-500);
		min-width: 36px;
		text-align: center;
	}

	.page-nav {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: 6px;
		padding-left: 8px;
		border-left: 1px solid var(--gray-200);
	}

	/* New layout wrapper */
	.pdf-body {
		flex: 1;
		display: flex;
		flex-direction: row;
		overflow: hidden;
		position: relative;
	}

	.pdf-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-width: 0;
	}

	/* Highlight toggle button — absolutely positioned at top-left of .pdf-body */
	.highlight-toggle-btn {
		position: absolute;
		left: 8px;
		top: 16px;
		z-index: 10;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: 1px solid var(--gray-200);
		background: var(--bg);
		color: var(--gray-400);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		box-shadow: var(--shadow-md);
		transition: all var(--transition-fast);
	}

	.highlight-toggle-btn:hover {
		background: var(--gray-100);
		color: var(--gray-700);
	}

	.highlight-toggle-btn.active {
		background: var(--amber-100);
		color: var(--amber-600);
		border-color: var(--amber-300);
	}

	/* Color palette — vertical stack below the toggle button */
	.highlight-palette {
		position: absolute;
		left: 8px;
		top: 56px;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-items: center;
		padding: 6px;
		background: var(--bg);
		border: 1px solid var(--gray-200);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md);
	}

	.palette-color-btn {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.palette-color-btn:hover {
		transform: scale(1.15);
	}

	.palette-color-btn.active {
		border-color: var(--gray-800);
		box-shadow: 0 0 0 2px var(--bg);
	}

	.pdf-content {
		flex: 1;
		overflow: auto;
		display: flex;
		justify-content: center;
		padding: 16px;
		background: var(--gray-100);
	}

	.pdf-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--gray-400);
		font-size: 14px;
	}

	.pdf-content :global(.pdf-page-wrapper) {
		box-shadow: var(--shadow-lg);
		background: white;
	}

	.pdf-content :global(.pdf-canvas) {
		display: block;
	}

	/* ── pdfjs 5.x textLayer — from pdf_viewer.css ── */
	:global(.textLayer) {
		position: absolute;
		text-align: initial;
		inset: 0;
		overflow: clip;
		opacity: 1;
		line-height: 1;
		-webkit-text-size-adjust: none;
		-moz-text-size-adjust: none;
		text-size-adjust: none;
		forced-color-adjust: none;
		transform-origin: 0 0;
		caret-color: CanvasText;
		z-index: 2;

		--min-font-size: 1;
		--text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
		--min-font-size-inv: calc(1 / var(--min-font-size));
	}

	:global(.textLayer :is(span, br)) {
		color: transparent;
		position: absolute;
		white-space: pre;
		cursor: text;
		transform-origin: 0% 0%;
	}

	:global(.textLayer > :not(.markedContent)),
	:global(.textLayer .markedContent span:not(.markedContent)) {
		z-index: 1;
		--font-height: 0;
		font-size: calc(var(--text-scale-factor) * var(--font-height));
		--scale-x: 1;
		--rotate: 0deg;
		transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
	}

	:global(.textLayer .markedContent) {
		display: contents;
	}

	:global(.textLayer span[role='img']) {
		-webkit-user-select: none;
		-moz-user-select: none;
		user-select: none;
		cursor: default;
	}

	:global(.textLayer ::selection) {
		background: rgba(0, 0, 255, 0.25);
		color: transparent;
	}

	:global(.textLayer br::selection) {
		background: transparent;
	}

	:global(.textLayer .endOfContent) {
		display: block;
		position: absolute;
		inset: 100% 0 0;
		z-index: 0;
		cursor: default;
		-webkit-user-select: none;
		-moz-user-select: none;
		user-select: none;
	}
	/* ── end textLayer ── */

	/* Annotation overlay sits above textLayer */
	.pdf-content :global(.pdf-annotation-overlay) {
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
		z-index: 3;
	}

	.pdf-content :global(.pdf-highlight) {
		position: absolute;
		border-radius: 2px 2px 0 0;
		pointer-events: none;
	}

	.pdf-content :global(.pdf-annotation-tooltip) {
		position: absolute;
		background: white;
		color: black;
		font-size: 11.5px;
		line-height: 1.4;
		padding: 5px 9px;
		border-radius: var(--radius-sm);
		max-width: 220px;
		white-space: pre-wrap;
		word-break: break-word;
		z-index: 100;
		pointer-events: none;
		box-shadow: var(--shadow-md);
		border: 1px solid var(--gray-300);
		display: none;
	}

	/* Annotations sidebar */
	.pdf-annotations-sidebar {
		width: 280px;
		min-width: 280px;
		border-left: 1px solid var(--gray-200);
		background: var(--gray-50);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}

	.annotations-sidebar-header {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 10.5px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--gray-400);
		padding: 10px 12px 8px;
		border-bottom: 1px solid var(--gray-200);
		flex-shrink: 0;
	}

	.annotation-sidebar-item {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 10px 12px;
		border-bottom: 1px solid var(--gray-100);
	}

	.annotation-sidebar-item:last-child {
		border-bottom: none;
	}

	.annotation-color-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
		margin-top: 3px;
	}

	.annotation-sidebar-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.annotation-sidebar-quote {
		font-size: 11.5px;
		color: var(--gray-500);
		font-style: italic;
		padding: 4px 6px;
		background: var(--bg);
		border-radius: var(--radius-sm);
		border-left: 2px solid var(--gray-200);
	}

	.annotation-comment-preview {
		font-size: 12px;
		color: var(--gray-700);
		line-height: 1.5;
		cursor: pointer;
		padding: 4px 6px;
		border-radius: var(--radius-sm);
		transition: background var(--transition-fast);
	}

	.annotation-comment-preview:hover {
		background: var(--gray-100);
	}

	.comment-placeholder {
		color: var(--gray-400);
		font-style: italic;
	}

	.annotation-comment-input {
		width: 100%;
		padding: 6px 8px;
		border: 1px solid var(--gray-200);
		border-radius: var(--radius-sm);
		font-size: 12px;
		resize: none;
		outline: none;
		background: var(--bg);
		color: var(--gray-800);
		font-family: var(--font-sans);
	}

	.annotation-comment-input:focus {
		border-color: var(--primary-400);
	}

	.annotation-edit-actions {
		display: flex;
		gap: 6px;
		justify-content: flex-end;
	}

	.annotation-save-btn {
		padding: 3px 10px;
		background: var(--primary-500);
		color: white;
		border-radius: var(--radius-sm);
		font-size: 11px;
		font-weight: 500;
		transition: background var(--transition-fast);
	}

	.annotation-save-btn:hover {
		background: var(--primary-600);
	}

	.annotation-cancel-btn {
		padding: 3px 10px;
		background: var(--gray-100);
		color: var(--gray-600);
		border-radius: var(--radius-sm);
		font-size: 11px;
		font-weight: 500;
		transition: background var(--transition-fast);
	}

	.annotation-cancel-btn:hover {
		background: var(--gray-200);
	}

	.annotation-delete-btn {
		width: 18px;
		height: 18px;
		border-radius: var(--radius-sm);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--gray-300);
		flex-shrink: 0;
		transition: all var(--transition-fast);
	}

	.annotation-delete-btn:hover {
		color: var(--rose-500);
		background: var(--rose-50);
	}
</style>
