<script lang="ts">
	import { onMount } from 'svelte';
	import type { NoteWithTags, Pdf } from '$lib/types';
	import type { Snippet } from 'svelte';
	import { isDark, toggleTheme } from '$lib/theme.svelte';
	import { exportAllData, importAllData, type ExportData } from '$lib/db';
	import { formatFileSize } from '$lib/utils';

	onMount(() => {
		const handler = () => closeNoteContextMenu();
		window.addEventListener('close-all-context-menus', handler);
		return () => window.removeEventListener('close-all-context-menus', handler);
	});

	let {
		notes,
		allPdfs = [],
		selectedId,
		onselect,
		oncreate,
		onsearch,
		onmovenote,
		onimport,
		ontoast,
		onopenPdf,
		ondeletePdf,
		onbulkdelete,
		folderSlot,
		tagSlot
	}: {
		notes: NoteWithTags[];
		allPdfs?: Pdf[];
		selectedId: number | null;
		onselect: (id: number) => void;
		oncreate: () => void;
		onsearch: (query: string) => void;
		onmovenote?: (noteId: number, folderId: number | null) => void;
		onimport?: () => void;
		ontoast?: (message: string, type?: 'info' | 'success' | 'warning', duration?: number) => void;
		onopenPdf?: (pdfId: number) => void;
		ondeletePdf?: (pdfId: number) => void;
		onbulkdelete?: (ids: number[]) => void;
		folderSlot?: Snippet;
		tagSlot?: Snippet;
	} = $props();

	let searchQuery = $state('');
	let noteContextMenu = $state<{ noteId: number; x: number; y: number } | null>(null);
	let idCopyFeedback = $state(false);

	// Bulk delete state
	let bulkMode = $state(false);
	let selectedNoteIds = $state<Set<number>>(new Set());
	let showBulkDeleteConfirm = $state(false);

	function toggleBulkMode() {
		bulkMode = !bulkMode;
		selectedNoteIds = new Set();
	}

	function toggleNoteSelection(noteId: number) {
		const next = new Set(selectedNoteIds);
		if (next.has(noteId)) {
			next.delete(noteId);
		} else {
			next.add(noteId);
		}
		selectedNoteIds = next;
	}

	function handleBulkDelete() {
		if (selectedNoteIds.size === 0) return;
		showBulkDeleteConfirm = true;
	}

	function confirmBulkDelete() {
		onbulkdelete?.([...selectedNoteIds]);
		selectedNoteIds = new Set();
		bulkMode = false;
		showBulkDeleteConfirm = false;
	}

	// PDF section state
	let showPdfSection = $state(false);
	let pdfSearchQuery = $state('');
	let pdfContextMenu = $state<{ pdfId: number; pdfName: string; x: number; y: number } | null>(null);
	let confirmPdfDelete = $state(false);

	function handlePdfContextMenu(e: MouseEvent, pdfId: number, pdfName: string) {
		e.preventDefault();
		e.stopPropagation();
		window.dispatchEvent(new CustomEvent('close-all-context-menus'));
		pdfContextMenu = { pdfId, pdfName, x: e.clientX, y: e.clientY };
		confirmPdfDelete = false;
	}

	function closePdfContextMenu() {
		pdfContextMenu = null;
		confirmPdfDelete = false;
	}

	async function copyPdfLink(pdfId: number) {
		await navigator.clipboard.writeText(`[[pdf:${pdfId}]]`);
		pdfContextMenu = null;
	}

	function handlePdfDelete() {
		if (!confirmPdfDelete) {
			confirmPdfDelete = true;
			return;
		}
		if (pdfContextMenu) {
			ondeletePdf?.(pdfContextMenu.pdfId);
			pdfContextMenu = null;
			confirmPdfDelete = false;
		}
	}

	let filteredPdfs = $derived(
		pdfSearchQuery
			? allPdfs.filter(p => p.filename.toLowerCase().includes(pdfSearchQuery.toLowerCase()))
			: allPdfs
	);

	let referencedPdfIds = $derived.by(() => {
		const ids = new Set<number>();
		const regex = /\[\[pdf:(\d+)\]\]/g;
		for (const note of notes) {
			regex.lastIndex = 0;
			let match;
			while ((match = regex.exec(note.content)) !== null) {
				ids.add(parseInt(match[1]));
			}
		}
		return ids;
	});

	function handleNoteContextMenu(e: MouseEvent, noteId: number) {
		e.preventDefault();
		e.stopPropagation();
		// Alle anderen Kontextmenüs schließen
		window.dispatchEvent(new CustomEvent('close-all-context-menus'));
		noteContextMenu = { noteId, x: e.clientX, y: e.clientY };
	}

	function closeNoteContextMenu() {
		noteContextMenu = null;
		closePdfContextMenu();
	}

	async function copyNoteId(noteId: number) {
		await navigator.clipboard.writeText(`[[id:${noteId}]]`);
		noteContextMenu = null;
		idCopyFeedback = true;
		setTimeout(() => (idCopyFeedback = false), 1500);
	}

	async function copyNoteIdRaw(noteId: number) {
		await navigator.clipboard.writeText(String(noteId));
		noteContextMenu = null;
	}

	function handleSearch() {
		onsearch(searchQuery);
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr + 'Z');
		return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
	}

	function getPreview(content: string): string {
		const firstLine = content.split('\n').find((l) => l.trim() !== '') || '';
		return firstLine.slice(0, 80);
	}

	function handleDragStart(e: DragEvent, noteId: number) {
		e.dataTransfer?.setData('application/note-id', String(noteId));
	}

	async function handleExport() {
		const data = await exportAllData();
		const json = JSON.stringify(data, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		const fileName = `knowledge-base-backup-${new Date().toISOString().slice(0, 10)}.json`;
		a.href = url;
		a.download = fileName;
		a.click();
		URL.revokeObjectURL(url);
		const hasImages = data.notes.some((n) => n.content.includes('asset.localhost'));
		const imageHint = hasImages ? '\n⚠ Bilder im AppData/images-Ordner müssen separat kopiert werden.' : '';
		ontoast?.(`Backup "${fileName}" in Downloads gespeichert.${imageHint}`, hasImages ? 'warning' : 'success', hasImages ? 5000 : 3000);
	}

	function handleImport() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;
			const text = await file.text();
			const data = JSON.parse(text) as ExportData;
			if (data.version !== 1 || !data.notes || !data.tags) {
				alert('Ungültiges Backup-Format');
				return;
			}
			if (!confirm(`Import von ${data.notes.length} Notizen, ${data.folders.length} Ordnern und ${data.tags.length} Tags?\n\nAlle bestehenden Daten werden ersetzt!`)) {
				return;
			}
			await importAllData(data);
			onimport?.();
			ontoast?.(`${data.notes.length} Notizen, ${data.folders.length} Ordner und ${data.tags.length} Tags importiert.`, 'success');
		};
		input.click();
	}
</script>

<svelte:window onclick={closeNoteContextMenu} oncontextmenu={closeNoteContextMenu} />

<aside class="sidebar">
	<div class="sidebar-header">
		<div class="search-wrapper">
			<svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="11" cy="11" r="8"/>
				<path d="m21 21-4.3-4.3"/>
			</svg>
			<input
				type="text"
				placeholder="Suchen..."
				bind:value={searchQuery}
				oninput={handleSearch}
				class="search-input"
			/>
		</div>
		<button
			class="bulk-btn"
			class:active={bulkMode}
			onclick={toggleBulkMode}
			title={bulkMode ? 'Auswahl beenden' : 'Mehrfachauswahl'}
		>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="9 11 12 14 22 4"/>
				<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
			</svg>
		</button>
		<button class="new-btn" onclick={oncreate} title="Neue Notiz">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
				<path d="M12 5v14M5 12h14"/>
			</svg>
		</button>
	</div>

	{#if folderSlot}
		<div class="sidebar-folders">
			{@render folderSlot()}
		</div>
	{/if}

	{#if tagSlot}
		{@render tagSlot()}
	{/if}

	{#if allPdfs.length > 0}
		<div class="pdf-section">
			<button class="pdf-section-header" onclick={() => (showPdfSection = !showPdfSection)}>
				<svg class="section-chevron" class:expanded={showPdfSection} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="9 18 15 12 9 6"/>
				</svg>
				<span>Dateien & Medien</span>
				<span class="pdf-count">{allPdfs.length}</span>
			</button>
			{#if showPdfSection}
				<div class="pdf-section-content">
					{#if allPdfs.length > 5}
						<input
							type="text"
							class="pdf-search"
							placeholder="Datei suchen..."
							bind:value={pdfSearchQuery}
						/>
					{/if}
					<div class="pdf-list">
						{#each filteredPdfs as pdf (pdf.id)}
							<button
								class="pdf-item"
								class:unreferenced={!referencedPdfIds.has(pdf.id)}
								onclick={() => onopenPdf?.(pdf.id)}
								oncontextmenu={(e) => handlePdfContextMenu(e, pdf.id, pdf.filename)}
								draggable="true"
								ondragstart={(e) => {
									e.dataTransfer?.setData('application/pdf-ref', String(pdf.id));
									e.dataTransfer?.setData('text/plain', `[[pdf:${pdf.id}]]`);
								}}
								title={pdf.filename + ' (' + formatFileSize(pdf.file_size) + ')' + (!referencedPdfIds.has(pdf.id) ? ' · Nicht verlinkt' : '')}
							>
								<svg class="pdf-icon-small" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
									<polyline points="14 2 14 8 20 8"/>
								</svg>
								<span class="pdf-filename">{pdf.filename}</span>
								{#if !referencedPdfIds.has(pdf.id)}
									<span class="unref-dot" title="Nicht verlinkt"></span>
								{/if}
								<span class="pdf-size">{formatFileSize(pdf.file_size)}</span>
							</button>
						{/each}
						{#if filteredPdfs.length === 0}
							<div class="pdf-empty">Keine Dateien gefunden</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<div class="note-list">
		{#each notes as note (note.id)}
			<button
				class="note-item"
				class:active={!bulkMode && note.id === selectedId}
				class:selected={bulkMode && selectedNoteIds.has(note.id)}
				onclick={() => bulkMode ? toggleNoteSelection(note.id) : onselect(note.id)}
				oncontextmenu={(e) => handleNoteContextMenu(e, note.id)}
				draggable={!bulkMode}
				ondragstart={(e) => handleDragStart(e, note.id)}
			>
				<div class="note-item-header">
					{#if bulkMode}
						<span class="bulk-checkbox" class:checked={selectedNoteIds.has(note.id)}>
							{#if selectedNoteIds.has(note.id)}
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
									<polyline points="20 6 9 17 4 12"/>
								</svg>
							{/if}
						</span>
					{/if}
					{#if note.pinned}
						<span class="pin-indicator" title="Angepinnt">
							<svg width="11" height="11" viewBox="0 0 24 24" fill="var(--amber-500)" stroke="var(--amber-500)" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
						</span>
					{/if}
					<span class="note-title">{note.title || 'Untitled'}</span>
				</div>
				<div class="note-preview">{getPreview(note.content)}</div>
				<div class="note-meta">
					<span class="note-date">{formatDate(note.updated_at)}</span>
					{#if note.tags.length > 0}
						<span class="note-tags-preview">
							{note.tags.map((t) => t.name).join(', ')}
						</span>
					{/if}
				</div>
			</button>
		{/each}

		{#if notes.length === 0}
			<div class="empty-state">
				<p>Keine Notizen gefunden</p>
			</div>
		{/if}
	</div>

	{#if bulkMode && selectedNoteIds.size > 0}
		<div class="bulk-action-bar">
			<span class="bulk-count">{selectedNoteIds.size} ausgewählt</span>
			<button class="bulk-delete-btn" onclick={handleBulkDelete}>
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="3 6 5 6 21 6"/>
					<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
				</svg>
				Löschen
			</button>
		</div>
	{/if}

	<div class="sidebar-footer">
		<button class="footer-btn" onclick={toggleTheme} title={isDark() ? 'Light Mode' : 'Dark Mode'}>
			{#if isDark()}
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="5"/>
					<line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
					<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
					<line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
					<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
				</svg>
			{:else}
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
				</svg>
			{/if}
		</button>
		<button class="footer-btn" onclick={handleExport} title="Backup exportieren">
			<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
				<polyline points="7 10 12 15 17 10"/>
				<line x1="12" y1="15" x2="12" y2="3"/>
			</svg>
		</button>
		<button class="footer-btn" onclick={handleImport} title="Backup importieren">
			<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
				<polyline points="17 8 12 3 7 8"/>
				<line x1="12" y1="3" x2="12" y2="15"/>
			</svg>
		</button>
	</div>
</aside>

{#if noteContextMenu}
	<div class="note-context-menu" style="left: {noteContextMenu.x}px; top: {noteContextMenu.y}px" onclick={(e) => e.stopPropagation()}>
		<button onclick={() => copyNoteId(noteContextMenu!.noteId)}>
			Link kopieren [[id:{noteContextMenu.noteId}]]
		</button>
		<button onclick={() => copyNoteIdRaw(noteContextMenu!.noteId)}>
			ID kopieren ({noteContextMenu.noteId})
		</button>
	</div>
{/if}

{#if pdfContextMenu}
	<div class="note-context-menu" style="left: {pdfContextMenu.x}px; top: {pdfContextMenu.y}px" onclick={(e) => e.stopPropagation()}>
		<button onclick={() => copyPdfLink(pdfContextMenu!.pdfId)}>
			Link kopieren [[pdf:{pdfContextMenu.pdfId}]]
		</button>
		<button
			class:confirm-delete={confirmPdfDelete}
			onclick={handlePdfDelete}
		>
			{confirmPdfDelete ? 'Wirklich löschen?' : 'PDF löschen'}
		</button>
	</div>
{/if}

{#if showBulkDeleteConfirm}
	<div class="modal-backdrop" onclick={() => (showBulkDeleteConfirm = false)}>
		<div class="modal" onclick={(e) => e.stopPropagation()}>
			<div class="modal-icon">
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="3 6 5 6 21 6"/>
					<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
				</svg>
			</div>
			<p class="modal-title">{selectedNoteIds.size} Notiz{selectedNoteIds.size > 1 ? 'en' : ''} löschen?</p>
			<p class="modal-body">Diese Aktion kann nicht rückgängig gemacht werden.</p>
			<div class="modal-actions">
				<button class="modal-cancel" onclick={() => (showBulkDeleteConfirm = false)}>Abbrechen</button>
				<button class="modal-confirm" onclick={confirmBulkDelete}>Löschen</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.sidebar {
		width: 272px;
		min-width: 272px;
		height: 100%;
		border-right: 1px solid var(--gray-200);
		display: flex;
		flex-direction: column;
		background: var(--gray-50);
		overflow: hidden;
	}

	.sidebar-header {
		padding: 12px;
		display: flex;
		gap: 8px;
		border-bottom: 1px solid var(--gray-200);
		flex-shrink: 0;
	}

	.search-wrapper {
		flex: 1;
		position: relative;
		display: flex;
		align-items: center;
	}

	.search-icon {
		position: absolute;
		left: 10px;
		color: var(--gray-400);
		pointer-events: none;
	}

	.search-input {
		width: 100%;
		padding: 7px 10px 7px 32px;
		border: 1px solid var(--gray-200);
		border-radius: var(--radius-md);
		outline: none;
		background: var(--bg);
		color: var(--gray-800);
		transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
	}

	.search-input::placeholder {
		color: var(--gray-400);
	}

	.search-input:focus {
		border-color: var(--primary-400);
		box-shadow: 0 0 0 3px var(--primary-50);
	}

	.new-btn {
		width: 34px;
		height: 34px;
		border-radius: var(--radius-md);
		background: var(--primary-500);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: background var(--transition-fast), transform var(--transition-fast);
	}

	.new-btn:hover {
		background: var(--primary-600);
		transform: scale(1.04);
	}

	.new-btn:active {
		transform: scale(0.96);
	}

	.sidebar-folders {
		max-height: 35%;
		overflow-y: auto;
		flex-shrink: 0;
	}

	.note-list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 4px 0;
	}

	.note-item {
		width: 100%;
		padding: 10px 14px;
		border: none;
		background: transparent;
		text-align: left;
		cursor: pointer;
		display: block;
		transition: background var(--transition-fast);
		border-left: 3px solid transparent;
	}

	.note-item:hover {
		background: var(--gray-100);
	}

	.note-item.active {
		background: var(--primary-50);
		border-left-color: var(--primary-500);
	}

	.note-item-header {
		display: flex;
		align-items: center;
		gap: 5px;
		margin-bottom: 3px;
	}

	.pin-indicator {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}

	.note-title {
		font-weight: 500;
		font-size: 13.5px;
		color: var(--gray-800);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.note-item.active .note-title {
		color: var(--primary-700);
	}

	.note-preview {
		font-size: 12px;
		color: var(--gray-500);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-bottom: 4px;
	}

	.note-meta {
		display: flex;
		gap: 8px;
		font-size: 11px;
		color: var(--gray-400);
	}

	.note-tags-preview {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--accent-600);
	}

	.empty-state {
		padding: 32px 16px;
		text-align: center;
		color: var(--gray-400);
		font-size: 13px;
	}

	.sidebar-footer {
		padding: 8px 12px;
		border-top: 1px solid var(--gray-200);
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.footer-btn {
		width: 30px;
		height: 30px;
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--gray-400);
		transition: all var(--transition-fast);
	}

	.footer-btn:hover {
		background: var(--gray-200);
		color: var(--gray-600);
	}

	.note-context-menu {
		position: fixed;
		background: var(--bg);
		border: 1px solid var(--gray-200);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		z-index: 100;
		min-width: 200px;
		overflow: hidden;
		padding: 4px;
	}

	.note-context-menu button {
		width: 100%;
		padding: 7px 12px;
		background: transparent;
		text-align: left;
		font-size: 13px;
		cursor: pointer;
		color: var(--gray-700);
		border-radius: var(--radius-sm);
		transition: background var(--transition-fast);
	}

	.note-context-menu button:hover {
		background: var(--gray-100);
	}

	.note-context-menu button.confirm-delete {
		color: var(--rose-600);
		font-weight: 500;
	}

	.note-context-menu button.confirm-delete:hover {
		background: var(--rose-50);
	}

	/* PDF Section */
	.pdf-section {
		border-bottom: 1px solid var(--gray-200);
		flex-shrink: 0;
	}

	.pdf-section-header {
		width: 100%;
		padding: 8px 14px;
		display: flex;
		align-items: center;
		gap: 6px;
		background: transparent;
		cursor: pointer;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--gray-500);
		transition: color var(--transition-fast);
	}

	.pdf-section-header:hover {
		color: var(--gray-700);
	}

	.section-chevron {
		flex-shrink: 0;
		transition: transform var(--transition-fast);
	}

	.section-chevron.expanded {
		transform: rotate(90deg);
	}

	.pdf-count {
		margin-left: auto;
		font-size: 10px;
		font-weight: 500;
		color: var(--gray-400);
		background: var(--gray-150, var(--gray-100));
		padding: 1px 6px;
		border-radius: var(--radius-full);
	}

	.pdf-section-content {
		padding: 0 10px 8px;
	}

	.pdf-search {
		width: 100%;
		padding: 5px 8px;
		margin-bottom: 4px;
		border: 1px solid var(--gray-200);
		border-radius: var(--radius-sm);
		outline: none;
		background: var(--bg);
		color: var(--gray-800);
		font-size: 12px;
		transition: border-color var(--transition-fast);
	}

	.pdf-search::placeholder {
		color: var(--gray-400);
	}

	.pdf-search:focus {
		border-color: var(--primary-400);
	}

	.pdf-list {
		max-height: 150px;
		overflow-y: auto;
	}

	.pdf-item {
		width: 100%;
		padding: 5px 8px;
		display: flex;
		align-items: center;
		gap: 6px;
		background: transparent;
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: background var(--transition-fast);
		text-align: left;
	}

	.pdf-item:hover {
		background: var(--gray-100);
	}

	.pdf-icon-small {
		flex-shrink: 0;
		color: var(--primary-500);
	}

	.pdf-filename {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 12px;
		color: var(--gray-700);
	}

	.pdf-size {
		flex-shrink: 0;
		font-size: 10px;
		color: var(--gray-400);
	}

	.pdf-empty {
		padding: 8px;
		text-align: center;
		color: var(--gray-400);
		font-size: 12px;
	}

	.pdf-item.unreferenced .pdf-filename {
		color: var(--gray-400);
	}

	.pdf-item.unreferenced .pdf-icon-small {
		color: var(--gray-300);
	}

	.unref-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--gray-300);
		flex-shrink: 0;
	}

	/* Bulk mode */
	.bulk-btn {
		width: 34px;
		height: 34px;
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: var(--gray-400);
		transition: all var(--transition-fast);
	}

	.bulk-btn:hover {
		background: var(--gray-200);
		color: var(--gray-600);
	}

	.bulk-btn.active {
		background: var(--primary-50);
		color: var(--primary-600);
		border: 1px solid var(--primary-300);
	}

	.bulk-checkbox {
		width: 16px;
		height: 16px;
		border: 2px solid var(--gray-300);
		border-radius: 3px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: all var(--transition-fast);
	}

	.bulk-checkbox.checked {
		background: var(--primary-500);
		border-color: var(--primary-500);
		color: white;
	}

	.note-item.selected {
		background: var(--primary-50);
		border-left-color: var(--primary-400);
	}

	.bulk-action-bar {
		padding: 8px 12px;
		border-top: 1px solid var(--gray-200);
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: var(--rose-50);
		flex-shrink: 0;
	}

	.bulk-count {
		font-size: 12px;
		font-weight: 500;
		color: var(--gray-600);
	}

	.bulk-delete-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 5px 10px;
		border-radius: var(--radius-md);
		background: var(--rose-500);
		color: white;
		font-size: 12px;
		font-weight: 500;
		transition: background var(--transition-fast);
	}

	.bulk-delete-btn:hover {
		background: var(--rose-600);
	}

	/* Bulk delete confirmation modal */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.35);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
	}

	.modal {
		background: var(--bg);
		border: 1px solid var(--gray-200);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		padding: 24px 24px 20px;
		width: 300px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}

	.modal-icon {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: var(--rose-50);
		color: var(--rose-500);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 4px;
	}

	.modal-title {
		font-size: 15px;
		font-weight: 600;
		color: var(--gray-800);
		text-align: center;
		margin: 0;
	}

	.modal-body {
		font-size: 13px;
		color: var(--gray-500);
		text-align: center;
		margin: 0 0 8px;
	}

	.modal-actions {
		display: flex;
		gap: 8px;
		width: 100%;
	}

	.modal-cancel {
		flex: 1;
		padding: 8px;
		border-radius: var(--radius-md);
		border: 1px solid var(--gray-200);
		background: transparent;
		color: var(--gray-600);
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.modal-cancel:hover {
		background: var(--gray-100);
	}

	.modal-confirm {
		flex: 1;
		padding: 8px;
		border-radius: var(--radius-md);
		background: var(--rose-500);
		color: white;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.modal-confirm:hover {
		background: var(--rose-600);
	}
</style>
