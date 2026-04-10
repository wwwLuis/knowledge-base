<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import { tick } from 'svelte';

	// Zeilenumbrüche im Markdown immer als <br> rendern (GFM-Style)
	marked.setOptions({ breaks: true });
	import { appDataDir, join } from '@tauri-apps/api/path';
	import { exists, mkdir, writeFile } from '@tauri-apps/plugin-fs';
	import { convertFileSrc } from '@tauri-apps/api/core';
	import TagInput from './TagInput.svelte';
	import NoteLinks from './NoteLinks.svelte';
	import type { NoteWithTags, Tag, Note, NoteLink, NoteAnnotation, Pdf } from '$lib/types';
	import { formatFileSize } from '$lib/utils';

	let {
		note,
		links,
		allNotes,
		allTags = [],
		allPdfs = [],
		noteAnnotations = [],
		onupdate,
		ondelete,
		ontogglepin,
		onaddtag,
		onremovetag,
		onnavigate,
		onopenPdf,
		onuploadPdf,
		ontoast,
		onback,
		oncreateannotation,
		ondeleteannotation,
		onupdateannotation,
		canGoBack = false
	}: {
		note: NoteWithTags | null;
		links: NoteLink[];
		allNotes: Note[];
		allTags?: Tag[];
		allPdfs?: Pdf[];
		noteAnnotations?: NoteAnnotation[];
		onupdate: (id: number, title: string, content: string) => void;
		ondelete: (id: number) => void;
		ontogglepin: (id: number, pinned: boolean) => void;
		onaddtag: (noteId: number, tagName: string) => void;
		onremovetag: (noteId: number, tagId: number) => void;
		onnavigate: (id: number) => void;
		onopenPdf?: (pdfId: number) => void;
		onuploadPdf?: (file: File) => Promise<Pdf | null>;
		ontoast?: (message: string, type?: 'info' | 'success' | 'warning', duration?: number) => void;
		onback?: () => void;
		oncreateannotation?: (noteId: number, color: string, selectedText: string, prefix: string, suffix: string, startOffset: number, endOffset: number, comment: string) => void;
		ondeleteannotation?: (id: number) => void;
		onupdateannotation?: (id: number, comment: string) => void;
		canGoBack?: boolean;
	} = $props();

	let title = $state('');
	let content = $state('');
	let previewMode = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let currentNoteId: number | null = null;
	let confirmDelete = $state(false);
	let showTagSection = $state(true);
	let showLinkSection = $state(true);

	const HIGHLIGHT_COLORS = [
		{ value: '#FDE047', label: 'Sonnengelb' },
		{ value: '#2DD4BF', label: 'Türkis' },
		{ value: '#38BDF8', label: 'Himmelblau' },
		{ value: '#FB7185', label: 'Lachsrosa' },
		{ value: '#A855F7', label: 'Amethyst' },
		{ value: '#FB923C', label: 'Pastellorange' }
	];

	// Highlight state
	let highlightMode = $state(false);
	let activeHighlightColor = $state('#FDE047');
	let previewEl = $state<HTMLDivElement | null>(null);

	// Annotation sidebar state
	let editingAnnotationId = $state<number | null>(null);
	let commentDraft = $state('');

	// Annotation tooltip state
	let tooltipVisible = $state(false);
	let tooltipText = $state('');
	let tooltipX = $state(0);
	let tooltipY = $state(0);

	function handlePreviewMouseMove(e: MouseEvent) {
		const mark = (e.target as HTMLElement).closest?.('mark.note-highlight[data-comment]') as HTMLElement | null;
		if (mark?.dataset.comment) {
			tooltipText = mark.dataset.comment;
			tooltipX = e.clientX + 14;
			tooltipY = e.clientY - 8;
			tooltipVisible = true;
		} else {
			tooltipVisible = false;
		}
	}

	function handlePreviewMouseLeave() {
		tooltipVisible = false;
	}
	let sortedAnnotations = $derived(
		[...noteAnnotations].sort((a, b) => a.start_offset - b.start_offset)
	);

	// Drag & drop state
	let isDraggingOver = $state(false);

	// Autocomplete state
	let showAutocomplete = $state(false);
	let autocompleteQuery = $state('');
	let autocompletePos = $state({ top: 0, left: 0 });
	let autocompleteIndex = $state(0);
	let autocompleteMode = $state<'note' | 'pdf'>('note');
	let textareaEl = $state<HTMLTextAreaElement | null>(null);

	let autocompleteSuggestions = $derived(
		autocompleteQuery === ''
			? allNotes.filter((n) => n.id !== note?.id).slice(0, 8)
			: allNotes
					.filter(
						(n) =>
							n.id !== note?.id &&
							n.title.toLowerCase().includes(autocompleteQuery.toLowerCase())
					)
					.slice(0, 8)
	);

	let pdfAutocompleteSuggestions = $derived(
		autocompleteQuery === ''
			? allPdfs.slice(0, 8)
			: allPdfs
					.filter(p => p.filename.toLowerCase().includes(autocompleteQuery.toLowerCase()))
					.slice(0, 8)
	);

	function checkAutocomplete() {
		if (!textareaEl) return;
		const pos = textareaEl.selectionStart;
		const textBefore = content.slice(0, pos);

		// Check for [[pdf: trigger
		const pdfTrigger = textBefore.lastIndexOf('[[pdf:');
		if (pdfTrigger !== -1 && !textBefore.includes(']]', pdfTrigger)) {
			autocompleteQuery = textBefore.slice(pdfTrigger + 6);
			autocompleteMode = 'pdf';
			autocompleteIndex = 0;
			showAutocomplete = true;
			updateAutocompletePosition();
			return;
		}

		// Check for /pdf trigger
		const slashPdfIdx = textBefore.lastIndexOf('/pdf');
		if (slashPdfIdx !== -1 && pos - slashPdfIdx <= 30 &&
			(slashPdfIdx === 0 || textBefore[slashPdfIdx - 1] === ' ' || textBefore[slashPdfIdx - 1] === '\n')) {
			autocompleteQuery = textBefore.slice(slashPdfIdx + 4).trim();
			autocompleteMode = 'pdf';
			autocompleteIndex = 0;
			showAutocomplete = true;
			updateAutocompletePosition();
			return;
		}

		// Check for /note trigger
		const slashNoteIdx = textBefore.lastIndexOf('/note');
		if (slashNoteIdx !== -1 && pos - slashNoteIdx <= 30 &&
			(slashNoteIdx === 0 || textBefore[slashNoteIdx - 1] === ' ' || textBefore[slashNoteIdx - 1] === '\n')) {
			autocompleteQuery = textBefore.slice(slashNoteIdx + 5).trim();
			autocompleteMode = 'note';
			autocompleteIndex = 0;
			showAutocomplete = true;
			updateAutocompletePosition();
			return;
		}

		// Original note autocomplete: [[
		const openBracket = textBefore.lastIndexOf('[[');
		if (openBracket === -1 || textBefore.includes(']]', openBracket)) {
			showAutocomplete = false;
			return;
		}
		const queryAfterBracket = textBefore.slice(openBracket + 2);
		if (queryAfterBracket.startsWith('pdf:')) {
			return; // Already handled above
		}
		autocompleteQuery = queryAfterBracket;
		autocompleteMode = 'note';
		autocompleteIndex = 0;
		showAutocomplete = true;
		updateAutocompletePosition();
	}

	function updateAutocompletePosition() {
		if (!textareaEl) return;
		const pos = textareaEl.selectionStart;
		const textBefore = content.slice(0, pos);
		const lines = textBefore.split('\n');
		const lineNum = lines.length - 1;
		const colNum = lines[lines.length - 1].length;

		const computed = getComputedStyle(textareaEl);
		const lineHeight = parseFloat(computed.lineHeight) || 23;
		const paddingTop = parseFloat(computed.paddingTop) || 20;
		const paddingLeft = parseFloat(computed.paddingLeft) || 24;
		const charWidth = 8.1;

		const rect = textareaEl.getBoundingClientRect();
		autocompletePos = {
			top: rect.top + paddingTop + (lineNum + 1) * lineHeight - textareaEl.scrollTop,
			left: rect.left + paddingLeft + colNum * charWidth
		};
	}

	function insertAutocomplete(item: Note | Pdf) {
		if (!textareaEl) return;
		const pos = textareaEl.selectionStart;
		const textBefore = content.slice(0, pos);

		if (autocompleteMode === 'pdf') {
			const pdf = item as Pdf;
			const ref = `[[pdf:${pdf.id}]]`;

			// Find trigger point: [[pdf: or /pdf
			const pdfTrigger = textBefore.lastIndexOf('[[pdf:');
			const slashTrigger = textBefore.lastIndexOf('/pdf');

			let startPos: number;
			if (pdfTrigger !== -1 && !textBefore.includes(']]', pdfTrigger)) {
				startPos = pdfTrigger;
			} else if (slashTrigger !== -1) {
				startPos = slashTrigger;
			} else {
				startPos = pos;
			}

			content = content.slice(0, startPos) + ref + content.slice(pos);
			showAutocomplete = false;
			scheduleUpdate();
			tick().then(() => {
				if (textareaEl) {
					const newPos = startPos + ref.length;
					textareaEl.focus();
					textareaEl.setSelectionRange(newPos, newPos);
				}
			});
		} else {
			const noteItem = item as Note;
			const ref = `[[id:${noteItem.id}]]`;

			const openBracket = textBefore.lastIndexOf('[[');
			const slashNoteTrigger = textBefore.lastIndexOf('/note');

			let startPos: number;
			if (openBracket !== -1 && !textBefore.includes(']]', openBracket)) {
				startPos = openBracket;
			} else if (slashNoteTrigger !== -1) {
				startPos = slashNoteTrigger;
			} else {
				startPos = pos;
			}

			content = content.slice(0, startPos) + ref + content.slice(pos);
			showAutocomplete = false;
			scheduleUpdate();
			tick().then(() => {
				if (textareaEl) {
					const newPos = startPos + ref.length;
					textareaEl.focus();
					textareaEl.setSelectionRange(newPos, newPos);
				}
			});
		}
	}

	function handleAutocompleteKeydown(e: KeyboardEvent) {
		const suggestions = autocompleteMode === 'pdf' ? pdfAutocompleteSuggestions : autocompleteSuggestions;
		if (!showAutocomplete || suggestions.length === 0) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			autocompleteIndex = (autocompleteIndex + 1) % suggestions.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			autocompleteIndex = (autocompleteIndex - 1 + suggestions.length) % suggestions.length;
		} else if (e.key === 'Enter' || e.key === 'Tab') {
			e.preventDefault();
			insertAutocomplete(suggestions[autocompleteIndex]);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			showAutocomplete = false;
		}
	}

	let renderedHtml = $derived(() => {
		// [[id:123]] → direkte ID-Referenz, [[pdf:123]] → PDF-Link, [[Notiz-Titel]] → Titel-basiert
		const withLinks = content.replace(/\[\[([^\]]+)\]\]/g, (_match, ref: string) => {
			// PDF-Referenz: [[pdf:123]]
			const pdfMatch = ref.match(/^pdf:(\d+)$/);
			if (pdfMatch) {
				const pdfId = Number(pdfMatch[1]);
				const pdfItem = allPdfs.find(p => p.id === pdfId);
				const label = pdfItem
					? (pdfItem.filename.length > 30 ? pdfItem.filename.slice(0, 30) + '...' : pdfItem.filename)
					: `PDF #${pdfId}`;
				const tooltip = pdfItem
					? `${pdfItem.filename} (${formatFileSize(pdfItem.file_size)})`
					: '';
				return `<a href="#" class="pdf-link" data-pdf-id="${pdfId}" title="${tooltip}"><span class="pdf-icon">&#128196;</span> ${label}</a>`;
			}
			// ID-basierte Referenz: [[id:123]]
			const idMatch = ref.match(/^id:(\d+)$/);
			if (idMatch) {
				const target = allNotes.find((n) => n.id === Number(idMatch[1]));
				if (target) {
					return `<a href="#" class="note-link" data-note-id="${target.id}">${target.title || 'Untitled'}</a>`;
				}
				return `<span class="note-link-missing">${ref}</span>`;
			}
			// Titel-basierte Referenz
			const matches = allNotes.filter(
				(n) => n.title.toLowerCase() === ref.toLowerCase()
			);
			if (matches.length === 1) {
				return `<a href="#" class="note-link" data-note-id="${matches[0].id}">${ref}</a>`;
			}
			if (matches.length > 1) {
				return `<a href="#" class="note-link note-link-ambiguous" data-note-id="${matches[0].id}" title="${matches.length} Notizen mit diesem Titel">${ref} (${matches.length})</a>`;
			}
			return `<span class="note-link-missing">${ref}</span>`;
		});
		return DOMPurify.sanitize(marked.parse(withLinks) as string, {
			ADD_ATTR: ['data-note-id', 'data-pdf-id']
		});
	});

	function handlePreviewClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.classList.contains('note-link') && target.dataset.noteId) {
			e.preventDefault();
			onnavigate(Number(target.dataset.noteId));
		}
		if ((target.classList.contains('pdf-link') || target.closest('.pdf-link')) && (target.dataset.pdfId || target.closest('.pdf-link')?.getAttribute('data-pdf-id'))) {
			e.preventDefault();
			const pdfId = Number(target.dataset.pdfId || target.closest('.pdf-link')?.getAttribute('data-pdf-id'));
			onopenPdf?.(pdfId);
		}
	}

	// Drag & Drop handlers
	function handleTextareaDragOver(e: DragEvent) {
		if (e.dataTransfer?.types.includes('application/pdf-ref') ||
			(e.dataTransfer?.types.includes('Files'))) {
			e.preventDefault();
			isDraggingOver = true;
		}
	}

	function handleTextareaDragLeave(e: DragEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
			isDraggingOver = false;
		}
	}

	async function handleTextareaDrop(e: DragEvent) {
		e.preventDefault();
		isDraggingOver = false;

		// Case 1: Internal PDF drag from sidebar
		const pdfRefId = e.dataTransfer?.getData('application/pdf-ref');
		if (pdfRefId) {
			insertTextAtCursor(`[[pdf:${pdfRefId}]]`);
			scheduleUpdate();
			return;
		}

		// Case 2: External file drop from OS
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			for (const file of Array.from(files)) {
				if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
					const pdf = await onuploadPdf?.(file);
					if (pdf) {
						insertTextAtCursor(`[[pdf:${pdf.id}]]`);
						scheduleUpdate();
					}
				}
			}
		}
	}

	function insertTextAtCursor(text: string) {
		if (!textareaEl) return;
		const pos = textareaEl.selectionStart;
		content = content.slice(0, pos) + text + content.slice(pos);
		tick().then(() => {
			if (textareaEl) {
				const newPos = pos + text.length;
				textareaEl.focus();
				textareaEl.setSelectionRange(newPos, newPos);
			}
		});
	}

	// PDF Upload
	function handlePdfUpload() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.pdf';
		input.onchange = () => {
			const file = input.files?.[0];
			if (file) onuploadPdf?.(file);
		};
		input.click();
	}

	// Note Highlighting — paint mode: select color first, then mark text
	function handlePreviewMouseUp(e: MouseEvent) {
		if (!highlightMode || !previewEl) return;
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed || !selection.toString().trim()) return;

		const range = selection.getRangeAt(0);
		const fullText = previewEl.textContent || '';

		// Calculate start offset: range from previewEl start → selection start
		const preRange = document.createRange();
		preRange.setStart(previewEl, 0);
		preRange.setEnd(range.startContainer, range.startOffset);
		const rawStart = preRange.toString().length;

		// Calculate end offset separately: range from previewEl start → selection end
		// (selection.toString() adds \n for block elements, textContent does not — so we
		//  must NOT derive endOffset from text.length)
		const endRange = document.createRange();
		endRange.setStart(previewEl, 0);
		endRange.setEnd(range.endContainer, range.endOffset);
		const rawEnd = endRange.toString().length;

		// Extract text from textContent (consistent with applyHighlights offset system)
		const rawText = fullText.slice(rawStart, rawEnd);
		const text = rawText.trim();
		if (!text) { selection.removeAllRanges(); return; }

		// Adjust offsets so they point at the trimmed text within fullText
		const trimLeading = rawText.length - rawText.trimStart().length;
		const startOffset = rawStart + trimLeading;
		const endOffset = startOffset + text.length;

		// Check if selection overlaps with existing highlight marks in the DOM
		const existingMarks = previewEl.querySelectorAll('mark.note-highlight');
		let hasOverlap = false;
		for (const mark of existingMarks) {
			const markRange = document.createRange();
			markRange.selectNodeContents(mark);
			if (range.compareBoundaryPoints(Range.START_TO_END, markRange) > 0 &&
				range.compareBoundaryPoints(Range.END_TO_START, markRange) < 0) {
				hasOverlap = true;
				break;
			}
		}
		if (hasOverlap) {
			selection.removeAllRanges();
			return;
		}

		const prefix = fullText.slice(Math.max(0, startOffset - 30), startOffset);
		const suffix = fullText.slice(endOffset, endOffset + 30);

		oncreateannotation?.(note!.id, activeHighlightColor, text, prefix, suffix, startOffset, endOffset, '');
		selection.removeAllRanges();
	}

	function applyHighlights() {
		if (!previewEl) return;
		// Remove existing marks
		previewEl.querySelectorAll('mark.note-highlight').forEach((m) => {
			const parent = m.parentNode;
			if (parent) {
				parent.replaceChild(document.createTextNode(m.textContent || ''), m);
				parent.normalize();
			}
		});

		if (noteAnnotations.length === 0) return;

		const walker = document.createTreeWalker(previewEl, NodeFilter.SHOW_TEXT);
		const textNodes: { node: Text; start: number; end: number }[] = [];
		let offset = 0;
		let node: Text | null;
		while ((node = walker.nextNode() as Text | null)) {
			textNodes.push({ node, start: offset, end: offset + node.length });
			offset += node.length;
		}

		// Apply highlights in reverse order so offsets stay valid
		const sorted = [...noteAnnotations].sort((a, b) => b.start_offset - a.start_offset);
		for (const ann of sorted) {
			applyHighlightToNodes(textNodes, ann);
		}
	}

	function applyHighlightToNodes(textNodes: { node: Text; start: number; end: number }[], ann: NoteAnnotation) {
		// Find matching text nodes
		const fullText = previewEl?.textContent || '';
		let start = ann.start_offset;
		let end = ann.end_offset;

		// Verify text still matches
		const actualText = fullText.slice(start, end);
		if (actualText !== ann.selected_text) {
			// Fallback: search for text with context
			const searchStr = ann.prefix_context + ann.selected_text + ann.suffix_context;
			const idx = fullText.indexOf(searchStr);
			if (idx >= 0) {
				start = idx + ann.prefix_context.length;
				end = start + ann.selected_text.length;
			} else {
				// Last resort: just find the text
				const simpleIdx = fullText.indexOf(ann.selected_text);
				if (simpleIdx >= 0) {
					start = simpleIdx;
					end = start + ann.selected_text.length;
				} else {
					return; // Can't find the text
				}
			}
		}

		// Collect all text nodes that overlap with this annotation range
		const overlapping: { node: Text; nodeStart: number; nodeEnd: number }[] = [];
		for (const tn of textNodes) {
			if (tn.end <= start || tn.start >= end) continue;
			overlapping.push({
				node: tn.node,
				nodeStart: Math.max(start - tn.start, 0),
				nodeEnd: Math.min(end - tn.start, tn.node.length)
			});
		}
		if (overlapping.length === 0) return;

		// Wrap each overlapping text node segment in a <mark>
		// Process in reverse so earlier node references stay valid
		for (let i = overlapping.length - 1; i >= 0; i--) {
			const { node: textNode, nodeStart, nodeEnd } = overlapping[i];

			// Skip empty/whitespace-only segments to avoid artifacts on blank lines
			const segmentText = textNode.textContent?.substring(nodeStart, nodeEnd) || '';
			if (segmentText.trim() === '') continue;

			const range = document.createRange();
			range.setStart(textNode, nodeStart);
			range.setEnd(textNode, nodeEnd);

			const mark = document.createElement('mark');
			mark.className = 'note-highlight';
			mark.style.backgroundColor = ann.color + '50';
			mark.style.borderBottom = `1px solid ${ann.color}`;
			mark.dataset.annotationId = String(ann.id);
			if (ann.comment) mark.dataset.comment = ann.comment;
			range.surroundContents(mark);
		}
	}

	// Apply highlights after render
	$effect(() => {
		if (previewMode && previewEl && noteAnnotations) {
			tick().then(() => applyHighlights());
		}
	});

	$effect(() => {
		if (note && note.id !== currentNoteId) {
			title = note.title;
			content = note.content;
			currentNoteId = note.id;
			// Neue leere Notiz → Edit-Modus, bestehende → Lese-Ansicht
			previewMode = note.title !== '' || note.content !== '';
			confirmDelete = false;
			editingAnnotationId = null;
		} else if (!note) {
			title = '';
			content = '';
			currentNoteId = null;
			confirmDelete = false;
			editingAnnotationId = null;
		}
	});

	function scheduleUpdate() {
		if (!note) return;
		const id = note.id;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			onupdate(id, title, content);
		}, 500);
	}

	function handleTitleInput() {
		scheduleUpdate();
	}

	function handleContentInput() {
		scheduleUpdate();
	}

	let copyFeedback = $state(false);
	let downloadFeedback = $state(false);

	function handleDelete() {
		if (!note) return;
		if (!confirmDelete) {
			confirmDelete = true;
			return;
		}
		ondelete(note.id);
		confirmDelete = false;
	}

	async function handleCopy() {
		if (!note) return;
		const md = title ? `# ${title}\n\n${content}` : content;
		await navigator.clipboard.writeText(md);
		copyFeedback = true;
		setTimeout(() => (copyFeedback = false), 1500);
	}

	function handleExportMarkdown() {
		if (!note) return;
		const md = title ? `# ${title}\n\n${content}` : content;
		const blob = new Blob([md], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		const fileName = `${title || 'untitled'}.md`;
		a.download = fileName;
		a.click();
		URL.revokeObjectURL(url);
		downloadFeedback = true;
		setTimeout(() => (downloadFeedback = false), 1500);
		ontoast?.(`"${fileName}" in Downloads gespeichert.`, 'success');
	}

	async function handlePaste(e: ClipboardEvent) {
		if (!note || !e.clipboardData) return;

		const items = e.clipboardData.items;
		for (const item of items) {
			if (item.type.startsWith('image/')) {
				e.preventDefault();
				const blob = item.getAsFile();
				if (!blob) return;

				const buffer = await blob.arrayBuffer();
				const ext = item.type.split('/')[1] || 'png';
				const fileName = `${crypto.randomUUID()}.${ext}`;

				const dataDir = await appDataDir();
				const imagesDir = await join(dataDir, 'images');

				if (!(await exists(imagesDir))) {
					await mkdir(imagesDir, { recursive: true });
				}

				const filePath = await join(imagesDir, fileName);
				await writeFile(filePath, new Uint8Array(buffer));

				const assetUrl = convertFileSrc(filePath);
				const markdownImage = `![](${assetUrl})`;

				const textarea = e.target as HTMLTextAreaElement;
				const pos = textarea.selectionStart;
				content = content.slice(0, pos) + markdownImage + content.slice(pos);
				scheduleUpdate();
				break;
			}
		}
	}
</script>

{#if note}
	<main class="editor">
		<div class="editor-header">
			{#if canGoBack}
				<button
					class="back-btn"
					onclick={() => onback?.()}
					title="Zurück zur vorherigen Notiz"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="19" y1="12" x2="5" y2="12"/>
						<polyline points="12 19 5 12 12 5"/>
					</svg>
				</button>
			{/if}
			<input
				type="text"
				class="title-input"
				placeholder="Titel..."
				bind:value={title}
				oninput={handleTitleInput}
			/>
			<div class="editor-actions">
				<button
					class="action-btn"
					class:active={previewMode}
					onclick={() => (previewMode = !previewMode)}
					title={previewMode ? 'Bearbeiten' : 'Vorschau'}
				>
					{#if previewMode}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
							<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
						</svg>
					{:else}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
							<circle cx="12" cy="12" r="3"/>
						</svg>
					{/if}
				</button>
				<button
					class="action-btn"
					onclick={handlePdfUpload}
					title="PDF anhängen"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
						<polyline points="14 2 14 8 20 8"/>
						<line x1="12" y1="18" x2="12" y2="12"/>
						<line x1="9" y1="15" x2="15" y2="15"/>
					</svg>
				</button>
				<button
					class="action-btn"
					class:pinned={note.pinned}
					onclick={() => ontogglepin(note!.id, !note!.pinned)}
					title={note.pinned ? 'Entpinnen' : 'Anpinnen'}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill={note.pinned ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
					</svg>
				</button>
				<button
					class="action-btn"
					class:copy-ok={copyFeedback}
					onclick={handleCopy}
					title="In Zwischenablage kopieren"
				>
					{#if copyFeedback}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="20 6 9 17 4 12"/>
						</svg>
					{:else}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
							<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
						</svg>
					{/if}
				</button>
				<button
					class="action-btn"
					class:copy-ok={downloadFeedback}
					onclick={handleExportMarkdown}
					title="Als Markdown exportieren"
				>
					{#if downloadFeedback}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="20 6 9 17 4 12"/>
						</svg>
					{:else}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
							<polyline points="7 10 12 15 17 10"/>
							<line x1="12" y1="15" x2="12" y2="3"/>
						</svg>
					{/if}
				</button>
				<button
					class="action-btn delete-btn"
					class:confirm={confirmDelete}
					onclick={handleDelete}
					title={confirmDelete ? 'Klicke erneut zum Löschen' : 'Löschen'}
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="3 6 5 6 21 6"/>
						<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
					</svg>
				</button>
			</div>
		</div>

		<div class="editor-content">
			{#if previewMode}
				<div class="note-preview-body">
					<!-- Floating highlight toggle button -->
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

					<!-- Floating color palette -->
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

					<!-- Main preview area -->
					<div class="note-main">
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="markdown-preview"
							class:highlight-mode={highlightMode}
							bind:this={previewEl}
							onclick={handlePreviewClick}
							onmouseup={handlePreviewMouseUp}
							onmousemove={handlePreviewMouseMove}
							onmouseleave={handlePreviewMouseLeave}
						>
							{@html renderedHtml()}
						</div>
					</div>

					<!-- Persistent annotations sidebar -->
					{#if noteAnnotations && noteAnnotations.length > 0}
						<aside class="pdf-annotations-sidebar">
							<div class="annotations-sidebar-header">
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
								<span>Annotationen</span>
							</div>
							{#each sortedAnnotations as ann (ann.id)}
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
													onupdateannotation?.(ann.id, commentDraft.trim());
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
									<button class="annotation-delete-btn" onclick={() => ondeleteannotation?.(ann.id)} title="Löschen">
										<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
									</button>
								</div>
							{/each}
						</aside>
					{/if}
				</div>
			{:else}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="textarea-wrapper"
					class:drag-over={isDraggingOver}
					ondragover={handleTextareaDragOver}
					ondragleave={handleTextareaDragLeave}
					ondrop={handleTextareaDrop}
				>
					<textarea
						class="content-textarea"
						placeholder="Schreibe in Markdown..."
						bind:value={content}
						bind:this={textareaEl}
						oninput={() => { handleContentInput(); checkAutocomplete(); }}
						onkeydown={handleAutocompleteKeydown}
						onpaste={handlePaste}
					></textarea>
					{#if isDraggingOver}
						<div class="drop-overlay">
							<span class="drop-overlay-label">PDF hier ablegen</span>
						</div>
					{/if}
				</div>
				{#if showAutocomplete}
					{#if autocompleteMode === 'pdf' && pdfAutocompleteSuggestions.length > 0}
						<div class="autocomplete-popup" style="top: {autocompletePos.top}px; left: {autocompletePos.left}px">
							{#each pdfAutocompleteSuggestions as pdf, i (pdf.id)}
								<button
									class="autocomplete-item"
									class:active={i === autocompleteIndex}
									onmousedown={(e) => { e.preventDefault(); insertAutocomplete(pdf); }}
									onmouseenter={() => (autocompleteIndex = i)}
								>
									<svg class="autocomplete-pdf-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
										<polyline points="14 2 14 8 20 8"/>
									</svg>
									{pdf.filename}
								</button>
							{/each}
						</div>
					{:else if autocompleteMode === 'note' && autocompleteSuggestions.length > 0}
						<div class="autocomplete-popup" style="top: {autocompletePos.top}px; left: {autocompletePos.left}px">
							{#each autocompleteSuggestions as suggestion, i (suggestion.id)}
								<button
									class="autocomplete-item"
									class:active={i === autocompleteIndex}
									onmousedown={(e) => { e.preventDefault(); insertAutocomplete(suggestion); }}
									onmouseenter={() => (autocompleteIndex = i)}
								>
									{suggestion.title || 'Untitled'}
								</button>
							{/each}
						</div>
					{/if}
				{/if}
			{/if}
		</div>

		<div class="editor-footer">
			<div class="footer-section">
				<button class="footer-section-header" onclick={() => (showTagSection = !showTagSection)}>
					<svg class="section-chevron" class:expanded={showTagSection} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="9 18 15 12 9 6"/>
					</svg>
					<span>Tags</span>
					{#if note.tags.length > 0}
						<span class="section-count">{note.tags.length}</span>
					{/if}
				</button>
				{#if showTagSection}
					<div class="footer-section-content">
						<TagInput
							tags={note.tags}
							{allTags}
							onadd={(name) => onaddtag(note!.id, name)}
							onremove={(tagId) => onremovetag(note!.id, tagId)}
						/>
					</div>
				{/if}
			</div>
			<div class="footer-section">
				<button class="footer-section-header" onclick={() => (showLinkSection = !showLinkSection)}>
					<svg class="section-chevron" class:expanded={showLinkSection} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="9 18 15 12 9 6"/>
					</svg>
					<span>Verlinkte Notizen</span>
					{#if links.length > 0}
						<span class="section-count">{links.length}</span>
					{/if}
				</button>
				{#if showLinkSection}
					<div class="footer-section-content footer-links-content">
						<NoteLinks
							{links}
							{onnavigate}
						/>
					</div>
				{/if}
			</div>
		</div>

		{#if tooltipVisible}
			<div class="note-annotation-tooltip" style="left: {tooltipX}px; top: {tooltipY}px">
				{tooltipText}
			</div>
		{/if}
	</main>

{:else}
	<main class="editor empty-editor">
		<div class="empty-message">Wähle eine Notiz oder erstelle eine neue</div>
	</main>
{/if}

<style>
	.editor {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--bg);
	}

	.empty-editor {
		align-items: center;
		justify-content: center;
	}

	.empty-message {
		color: var(--gray-400);
		font-size: 15px;
	}

	.editor-header {
		padding: 14px 20px;
		border-bottom: 1px solid var(--gray-200);
		display: flex;
		align-items: center;
		gap: 12px;
		flex-shrink: 0;
	}

	.back-btn {
		width: 32px;
		height: 32px;
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: var(--gray-400);
		transition: all var(--transition-fast);
	}

	.back-btn:hover {
		background: var(--gray-100);
		color: var(--primary-600);
	}

	.title-input {
		flex: 1;
		min-width: 0;
		border: none;
		outline: none;
		font-size: 20px;
		font-weight: 600;
		background: transparent;
		color: var(--gray-900);
		letter-spacing: -0.01em;
	}

	.title-input::placeholder {
		color: var(--gray-300);
	}

	.editor-actions {
		display: flex;
		gap: 6px;
		flex-shrink: 0;
	}

	.action-btn {
		width: 32px;
		height: 32px;
		border: 1px solid var(--gray-200);
		border-radius: var(--radius-md);
		background: var(--bg);
		color: var(--gray-500);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: all var(--transition-fast);
	}

	.action-btn:hover {
		background: var(--gray-100);
		color: var(--gray-800);
		border-color: var(--gray-300);
	}

	.action-btn.active {
		background: var(--primary-500);
		color: white;
		border-color: var(--primary-500);
	}

	.action-btn.pinned {
		background: var(--amber-50);
		border-color: var(--amber-400);
		color: var(--amber-500);
	}

	.action-btn.copy-ok {
		color: var(--accent-500);
		border-color: var(--accent-400);
		background: var(--accent-50);
	}

	.delete-btn:hover {
		background: var(--rose-50);
		border-color: var(--rose-400);
		color: var(--rose-500);
	}

	.delete-btn.confirm {
		background: var(--rose-500);
		color: white;
		border-color: var(--rose-500);
		animation: pulse-delete 1s infinite;
	}

	@keyframes pulse-delete {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.7; }
	}

	.editor-content {
		flex: 1;
		overflow: hidden;
		display: flex;
		position: relative;
		z-index: 1;
	}

	.textarea-wrapper {
		flex: 1;
		position: relative;
		display: flex;
		min-height: 0;
	}

	.textarea-wrapper.drag-over .content-textarea {
		opacity: 0.5;
	}

	.drop-overlay {
		position: absolute;
		inset: 8px;
		background: rgba(99, 102, 241, 0.06);
		border: 2px dashed var(--primary-400);
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		z-index: 5;
	}

	.drop-overlay-label {
		font-size: 14px;
		font-weight: 500;
		color: var(--primary-600);
		background: var(--bg);
		padding: 8px 16px;
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md);
	}

	.content-textarea {
		width: 100%;
		height: 100%;
		padding: 20px 50px;
		border: none;
		outline: none;
		resize: none;
		font-family: var(--font-mono);
		font-size: 13.5px;
		line-height: 1.7;
		background: transparent;
		color: var(--gray-800);
	}

	.content-textarea::placeholder {
		color: var(--gray-300);
	}

	.note-preview-body {
		flex: 1;
		display: flex;
		flex-direction: row;
		overflow: hidden;
		position: relative;
	}

	.note-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-width: 0;
	}

	/* Floating highlight toggle button */
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

	/* Floating color palette — vertical stack below toggle button */
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

	.markdown-preview {
		width: 100%;
		flex: 1;
		padding: 20px 50px;
		overflow-y: auto;
		line-height: 1.7;
		color: var(--gray-800);
	}

	.markdown-preview :global(h1) {
		font-size: 24px;
		font-weight: 700;
		margin-bottom: 12px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--gray-200);
		color: var(--gray-900);
		letter-spacing: -0.02em;
	}

	.markdown-preview :global(h2) {
		font-size: 20px;
		font-weight: 600;
		margin-bottom: 10px;
		color: var(--gray-900);
		letter-spacing: -0.01em;
	}

	.markdown-preview :global(h3) {
		font-size: 16px;
		font-weight: 600;
		margin-bottom: 8px;
		color: var(--gray-800);
	}

	.markdown-preview :global(p) {
		margin-bottom: 12px;
	}

	.markdown-preview :global(code) {
		background: var(--gray-100);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: 12.5px;
		color: var(--primary-700);
	}

	.markdown-preview :global(pre) {
		background: var(--gray-50);
		border: 1px solid var(--gray-200);
		padding: 14px 16px;
		border-radius: var(--radius-md);
		overflow-x: auto;
		margin-bottom: 12px;
	}

	.markdown-preview :global(pre code) {
		padding: 0;
		background: transparent;
		color: var(--gray-800);
	}

	.markdown-preview :global(ul),
	.markdown-preview :global(ol) {
		margin-bottom: 12px;
		padding-left: 24px;
	}

	.markdown-preview :global(li) {
		margin-bottom: 4px;
	}

	.markdown-preview :global(blockquote) {
		border-left: 3px solid var(--primary-200);
		padding-left: 14px;
		color: var(--gray-500);
		margin-bottom: 12px;
		font-style: italic;
	}

	.markdown-preview :global(img) {
		max-width: 100%;
		border-radius: var(--radius-md);
		margin: 8px 0;
		box-shadow: var(--shadow-sm);
	}

	.markdown-preview :global(a) {
		color: var(--primary-600);
		text-decoration: none;
	}

	.markdown-preview :global(a:hover) {
		text-decoration: underline;
	}

	.markdown-preview :global(.note-link) {
		color: var(--primary-600);
		cursor: pointer;
		text-decoration: none;
		font-weight: 500;
		border-bottom: 1px dashed var(--primary-400);
		transition: all var(--transition-fast);
	}

	.markdown-preview :global(.note-link:hover) {
		color: var(--primary-700);
		border-bottom-style: solid;
	}

	.markdown-preview :global(.note-link-ambiguous) {
		border-bottom-color: var(--amber-400);
		color: var(--amber-500);
	}

	.markdown-preview :global(.note-link-ambiguous:hover) {
		color: var(--amber-500);
	}

	.markdown-preview :global(.note-link-missing) {
		color: var(--rose-500);
		text-decoration: underline dotted;
	}

	.markdown-preview.highlight-mode {
		cursor: text;
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

	.markdown-preview :global(.pdf-link) {
		color: var(--primary-600);
		cursor: pointer;
		font-weight: 500;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		background: var(--primary-50);
		border-radius: var(--radius-sm);
		border: 1px solid var(--primary-200);
		transition: all var(--transition-fast);
		text-decoration: none;
	}

	.markdown-preview :global(.pdf-link:hover) {
		background: var(--primary-100);
		border-color: var(--primary-400);
		text-decoration: none;
	}

	.markdown-preview :global(.note-highlight) {
		border-radius: 2px;
		padding: 0 1px;
		position: relative;
	}

	.note-annotation-tooltip {
		position: fixed;
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

	.markdown-preview :global(hr) {
		border: none;
		border-top: 1px solid var(--gray-200);
		margin: 20px 0;
	}

	.markdown-preview :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin-bottom: 12px;
	}

	.markdown-preview :global(th),
	.markdown-preview :global(td) {
		padding: 8px 12px;
		border: 1px solid var(--gray-200);
		text-align: left;
	}

	.markdown-preview :global(th) {
		background: var(--gray-50);
		font-weight: 600;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--gray-600);
	}

	.autocomplete-popup {
		position: fixed;
		background: var(--bg);
		border: 1px solid var(--gray-200);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		z-index: 50;
		min-width: 220px;
		max-width: 350px;
		max-height: 200px;
		overflow-y: auto;
		padding: 4px;
	}

	.autocomplete-item {
		width: 100%;
		padding: 6px 10px;
		background: transparent;
		text-align: left;
		font-size: 13px;
		color: var(--gray-700);
		border-radius: var(--radius-sm);
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		transition: background var(--transition-fast);
		display: flex;
		align-items: center;
	}

	.autocomplete-item:hover,
	.autocomplete-item.active {
		background: var(--primary-50);
		color: var(--primary-700);
	}

	.autocomplete-pdf-icon {
		flex-shrink: 0;
		color: var(--primary-500);
		margin-right: 4px;
	}

	.editor-footer {
		border-top: 1px solid var(--gray-200);
		background: var(--gray-50);
		flex-shrink: 0;
		max-height: 40%;
		overflow-y: auto;
		position: relative;
		z-index: 10;
	}

	.footer-section {
		border-bottom: 1px solid var(--gray-200);
	}

	.footer-section:last-child {
		border-bottom: none;
	}

	.footer-section-header {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 20px;
		color: var(--gray-400);
		font-size: 10.5px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.8px;
		transition: color var(--transition-fast);
	}

	.footer-section-header:hover {
		color: var(--gray-600);
	}

	.footer-section-header span:first-of-type {
		flex: 1;
		text-align: left;
	}

	.section-chevron {
		flex-shrink: 0;
		transition: transform var(--transition-fast);
	}

	.section-chevron.expanded {
		transform: rotate(90deg);
	}

	.section-count {
		font-size: 10px;
		background: var(--gray-200);
		color: var(--gray-500);
		padding: 1px 6px;
		border-radius: var(--radius-full);
		line-height: 1.2;
		font-weight: 500;
	}

	.footer-section-content {
		padding: 0 20px 8px;
	}

	.footer-links-content {
		max-height: 150px;
		overflow-y: auto;
	}
</style>
