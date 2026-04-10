<script lang="ts">
	import { onMount } from 'svelte';
	import NoteList from '$lib/components/NoteList.svelte';
	import NoteEditor from '$lib/components/NoteEditor.svelte';
	import TagFilter from '$lib/components/TagFilter.svelte';
	import FolderTree from '$lib/components/FolderTree.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import PdfViewer from '$lib/components/PdfViewer.svelte';
	import { appDataDir, join } from '@tauri-apps/api/path';
	import { exists, mkdir, writeFile, remove } from '@tauri-apps/plugin-fs';
	import * as db from '$lib/db';
	import type { Note, NoteWithTags, Tag, NoteLink, FolderTree as FolderTreeType, Pdf, PdfAnnotation, NoteAnnotation } from '$lib/types';

	let toastMessage = $state('');
	let toastType = $state<'info' | 'success' | 'warning'>('info');
	let toastVisible = $state(false);

	function showToast(message: string, type: 'info' | 'success' | 'warning' = 'info', duration = 3000) {
		toastMessage = message;
		toastType = type;
		toastVisible = true;
		setTimeout(() => (toastVisible = false), duration);
	}

	let notes = $state<NoteWithTags[]>([]);
	let allNotesUnfiltered = $state<Note[]>([]);
	let allTags = $state<Tag[]>([]);
	let allPdfs = $state<Pdf[]>([]);
	let folderTree = $state<FolderTreeType[]>([]);
	let selectedNote = $state<NoteWithTags | null>(null);
	let noteLinks = $state<NoteLink[]>([]);
	let activeTagId = $state<number | null>(null);
	let activeFolderId = $state<number | null>(null);
	let searchQuery = $state('');
	let navigationHistory = $state<number[]>([]);

	// PDF state
	let activePdf = $state<Pdf | null>(null);
	let pdfAnnotations = $state<PdfAnnotation[]>([]);

	// Note annotations state
	let noteAnnotations = $state<NoteAnnotation[]>([]);

	function navigateBack() {
		if (navigationHistory.length === 0) return;
		const prevId = navigationHistory[navigationHistory.length - 1];
		navigationHistory = navigationHistory.slice(0, -1);
		selectNote(prevId);
	}

	onMount(() => {
		loadNotes();
		loadAllNotes();
		loadTags();
		loadFolders();
		loadPdfs();
	});

	async function loadPdfs() {
		allPdfs = await db.getAllPdfs();
	}

	async function loadAllNotes() {
		allNotesUnfiltered = await db.getAllNotes();
	}

	async function loadFolders() {
		const folders = await db.getAllFolders();
		folderTree = db.buildFolderTree(folders);
	}

	async function loadNotes() {
		let rawNotes;
		if (searchQuery) {
			rawNotes = await db.searchNotes(searchQuery);
		} else if (activeTagId && activeFolderId !== null) {
			// Kombinierter Filter: Ordner + Tag
			rawNotes = await db.getNotesByFolderAndTag(activeFolderId, activeTagId);
		} else if (activeTagId) {
			rawNotes = await db.getNotesByFolderAndTag(null, activeTagId);
		} else if (activeFolderId !== null) {
			rawNotes = await db.getNotesByFolder(activeFolderId);
		} else {
			rawNotes = await db.getAllNotes();
		}

		const enriched: NoteWithTags[] = [];
		for (const note of rawNotes) {
			const tags = await db.getTagsForNote(note.id);
			enriched.push({ ...note, tags });
		}
		notes = enriched;

		if (selectedNote) {
			const found = notes.find((n) => n.id === selectedNote!.id);
			if (found) {
				selectedNote = found;
			} else if (notes.length > 0) {
				await selectNote(notes[0].id);
			} else {
				selectedNote = null;
				noteLinks = [];
			}
		}
	}

	async function loadTags() {
		allTags = await db.getAllTags();
	}

	async function selectNote(id: number) {
		const found = notes.find((n) => n.id === id);
		if (found) {
			selectedNote = found;
			noteLinks = await db.getLinksForNote(id);
			noteAnnotations = await db.getNoteAnnotations(id);
		}
	}

	async function createNote() {
		try {
			const note = await db.createNote(activeFolderId);
			searchQuery = '';
			activeTagId = null;
			await loadNotes();
			await selectNote(note.id);
		} catch (e) {
			console.error('createNote failed:', e);
		}
	}

	async function handleUpdate(id: number, title: string, content: string) {
		await db.updateNote(id, title, content);
		// Inline [[wiki-links]] automatisch als note_links synchronisieren
		await syncInlineLinks(id, content);
		await loadNotes();
		await loadAllNotes();
		if (selectedNote && selectedNote.id === id) {
			noteLinks = await db.getLinksForNote(id);
		}
	}

	async function syncInlineLinks(noteId: number, content: string) {
		const linkRegex = /\[\[([^\]]+)\]\]/g;
		const referencedIds = new Set<number>();
		let match;
		while ((match = linkRegex.exec(content)) !== null) {
			const ref = match[1];
			const idMatch = ref.match(/^id:(\d+)$/);
			if (idMatch) {
				referencedIds.add(Number(idMatch[1]));
			} else {
				const targets = allNotesUnfiltered.filter(
					(n) => n.title.toLowerCase() === ref.toLowerCase()
				);
				if (targets.length === 1) {
					referencedIds.add(targets[0].id);
				}
			}
		}
		// Neue Links hinzufügen
		for (const targetId of referencedIds) {
			if (targetId !== noteId) {
				await db.addNoteLink(noteId, targetId);
			}
		}
		// Gelöschte Links entfernen (nur ausgehende, die nicht mehr im Content sind)
		const existingOutgoing = await db.getOutgoingLinkIds(noteId);
		for (const existingTargetId of existingOutgoing) {
			if (!referencedIds.has(existingTargetId)) {
				await db.removeOutgoingLink(noteId, existingTargetId);
			}
		}
	}

	async function handleDelete(id: number) {
		await db.deleteNote(id);
		await db.deleteOrphanedTags();
		selectedNote = null;
		noteLinks = [];
		await loadNotes();
		await loadAllNotes();
		await loadTags();
	}

	async function handleBulkDeleteNotes(ids: number[]) {
		for (const id of ids) {
			await db.deleteNote(id);
		}
		await db.deleteOrphanedTags();
		if (selectedNote && ids.includes(selectedNote.id)) {
			selectedNote = null;
			noteLinks = [];
		}
		await loadNotes();
		await loadAllNotes();
		await loadTags();
		showToast(`${ids.length} Notiz${ids.length > 1 ? 'en' : ''} gelöscht`, 'success');
	}

	async function handleTogglePin(id: number, pinned: boolean) {
		await db.togglePin(id, pinned);
		await loadNotes();
	}

	async function handleSearch(query: string) {
		searchQuery = query;
		await loadNotes();
	}

	async function handleTagFilter(tagId: number | null) {
		activeTagId = tagId;
		searchQuery = '';
		await loadNotes();
	}

	async function handleAddTag(noteId: number, tagName: string) {
		await db.addTagToNote(noteId, tagName);
		await loadNotes();
		await loadTags();
	}

	async function handleRemoveTag(noteId: number, tagId: number) {
		await db.removeTagFromNote(noteId, tagId);
		await db.deleteOrphanedTags();
		await loadNotes();
		await loadTags();
	}

	async function handleAddLink(targetId: number) {
		if (!selectedNote) return;
		await db.addNoteLink(selectedNote.id, targetId);
		noteLinks = await db.getLinksForNote(selectedNote.id);
	}

	async function handleRemoveLink(sourceId: number, targetId: number) {
		await db.removeNoteLink(sourceId, targetId);
		if (selectedNote) {
			noteLinks = await db.getLinksForNote(selectedNote.id);
		}
	}

	async function handleNavigate(id: number) {
		// Aktuelle Note auf History-Stack
		if (selectedNote) {
			navigationHistory = [...navigationHistory, selectedNote.id];
		}
		// Notiz könnte durch Filter ausgeschlossen sein — Filter zurücksetzen
		const found = notes.find((n) => n.id === id);
		if (!found) {
			searchQuery = '';
			activeTagId = null;
			activeFolderId = null;
			await loadNotes();
		}
		await selectNote(id);
	}

	async function handleFolderSelect(folderId: number | null) {
		activeFolderId = folderId;
		searchQuery = '';
		await loadNotes();
	}

	async function handleFolderCreate(parentId: number | null) {
		const name = 'Neuer Ordner';
		await db.createFolder(name, parentId);
		await loadFolders();
	}

	async function handleFolderRename(id: number, name: string) {
		await db.renameFolder(id, name);
		await loadFolders();
	}

	async function handleFolderDelete(id: number) {
		await db.deleteFolder(id);
		if (activeFolderId === id) {
			activeFolderId = null;
		}
		await loadFolders();
		await loadNotes();
	}

	async function handleMoveNote(noteId: number, folderId: number | null) {
		await db.moveNoteToFolder(noteId, folderId);
		await loadNotes();
	}

	async function handleFolderMove(folderId: number, newParentId: number | null) {
		await db.moveFolderToParent(folderId, newParentId);
		await loadFolders();
	}

	async function handleImportComplete() {
		selectedNote = null;
		noteLinks = [];
		activeFolderId = null;
		activeTagId = null;
		searchQuery = '';
		await loadNotes();
		await loadAllNotes();
		await loadTags();
		await loadFolders();
	}

	// --- PDF Handling ---

	async function handleOpenPdf(pdfId: number) {
		const pdf = await db.getPdfById(pdfId);
		if (!pdf) {
			showToast('PDF nicht gefunden', 'warning');
			return;
		}
		activePdf = pdf;
		pdfAnnotations = await db.getPdfAnnotations(pdfId);
	}

	function handleClosePdf() {
		activePdf = null;
		pdfAnnotations = [];
	}

	async function handleDeletePdf(pdfId: number) {
		try {
			const pdf = await db.getPdfById(pdfId);
			if (!pdf) return;

			// Close viewer if this PDF is currently open
			if (activePdf?.id === pdfId) {
				handleClosePdf();
			}

			// Delete file from disk
			const dataDir = await appDataDir();
			const filePath = await join(dataDir, 'pdfs', pdf.stored_name);
			if (await exists(filePath)) {
				await remove(filePath);
			}

			// Delete from database (cascades to annotations)
			await db.deletePdf(pdfId);
			await loadPdfs();
			showToast(`PDF "${pdf.filename}" gelöscht`, 'success');
		} catch (err) {
			console.error('PDF delete error:', err);
			showToast('PDF konnte nicht gelöscht werden', 'warning');
		}
	}

	async function handleUploadPdf(file: File): Promise<Pdf | null> {
		try {
			const buffer = await file.arrayBuffer();
			const storedName = `${crypto.randomUUID()}.pdf`;

			const dataDir = await appDataDir();
			const pdfsDir = await join(dataDir, 'pdfs');
			if (!(await exists(pdfsDir))) {
				await mkdir(pdfsDir, { recursive: true });
			}

			const filePath = await join(pdfsDir, storedName);
			await writeFile(filePath, new Uint8Array(buffer));

			// Get page count via pdfjs
			let pageCount = 0;
			try {
				const pdfjsLib = await import('pdfjs-dist');
				pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
					'pdfjs-dist/build/pdf.worker.min.mjs',
					import.meta.url
				).href;
				const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
				pageCount = doc.numPages;
			} catch {
				// Fallback if pdfjs fails
			}

			const pdf = await db.createPdf(file.name, storedName, pageCount, file.size);
			await loadPdfs();

			showToast(`PDF "${file.name}" hochgeladen (ID: ${pdf.id})`, 'success');
			return pdf;
		} catch (err) {
			console.error('PDF upload error:', err);
			showToast('PDF-Upload fehlgeschlagen', 'warning');
			return null;
		}
	}

	async function handleCreatePdfAnnotation(pdfId: number, page: number, color: string, rectsJson: string, text: string, comment: string) {
		const newAnnotation = await db.createPdfAnnotation(pdfId, page, color, rectsJson, text, comment);
		pdfAnnotations = [...pdfAnnotations, newAnnotation];
	}

	async function handleDeletePdfAnnotation(id: number) {
		await db.deletePdfAnnotation(id);
		if (activePdf) {
			pdfAnnotations = await db.getPdfAnnotations(activePdf.id);
		}
	}

	async function handleUpdatePdfAnnotation(id: number, color: string, comment: string) {
		await db.updatePdfAnnotation(id, color, comment);
		if (activePdf) {
			pdfAnnotations = await db.getPdfAnnotations(activePdf.id);
		}
	}

	// --- Note Annotations ---

	async function handleCreateNoteAnnotation(noteId: number, color: string, selectedText: string, prefix: string, suffix: string, startOffset: number, endOffset: number, comment: string) {
		await db.createNoteAnnotation(noteId, color, selectedText, prefix, suffix, startOffset, endOffset, comment);
		noteAnnotations = await db.getNoteAnnotations(noteId);
	}

	async function handleDeleteNoteAnnotation(id: number) {
		await db.deleteNoteAnnotation(id);
		if (selectedNote) {
			noteAnnotations = await db.getNoteAnnotations(selectedNote.id);
		}
	}

	async function handleUpdateNoteAnnotation(id: number, comment: string) {
		const ann = noteAnnotations.find(a => a.id === id);
		if (!ann) return;
		await db.updateNoteAnnotation(id, ann.color, comment);
		if (selectedNote) {
			noteAnnotations = await db.getNoteAnnotations(selectedNote.id);
		}
	}
</script>

<div class="sidebar-wrapper">
	<NoteList
		{notes}
		{allPdfs}
		selectedId={selectedNote?.id ?? null}
		onselect={selectNote}
		oncreate={createNote}
		onsearch={handleSearch}
		onmovenote={handleMoveNote}
		onimport={handleImportComplete}
		ontoast={showToast}
		onopenPdf={handleOpenPdf}
		ondeletePdf={handleDeletePdf}
		onbulkdelete={handleBulkDeleteNotes}
	>
		{#snippet folderSlot()}
			<FolderTree
				folders={folderTree}
				{activeFolderId}
				onselect={handleFolderSelect}
				oncreate={handleFolderCreate}
				onrename={handleFolderRename}
				ondelete={handleFolderDelete}
				onnotedrop={handleMoveNote}
				onfoldermove={handleFolderMove}
			/>
		{/snippet}
		{#snippet tagSlot()}
			<TagFilter tags={allTags} {activeTagId} onselect={handleTagFilter} />
		{/snippet}
	</NoteList>
</div>
{#if activePdf}
	<PdfViewer
		pdf={activePdf}
		annotations={pdfAnnotations}
		onclose={handleClosePdf}
		oncreateannotation={handleCreatePdfAnnotation}
		ondeleteannotation={handleDeletePdfAnnotation}
		onupdateannotation={handleUpdatePdfAnnotation}
	/>
{:else}
	<NoteEditor
		note={selectedNote}
		links={noteLinks}
		allNotes={allNotesUnfiltered}
		{allTags}
		{allPdfs}
		{noteAnnotations}
		onupdate={handleUpdate}
		ondelete={handleDelete}
		ontogglepin={handleTogglePin}
		onaddtag={handleAddTag}
		onremovetag={handleRemoveTag}
		onnavigate={handleNavigate}
		onopenPdf={handleOpenPdf}
		onuploadPdf={handleUploadPdf}
		ontoast={showToast}
		onback={navigateBack}
		oncreateannotation={handleCreateNoteAnnotation}
		ondeleteannotation={handleDeleteNoteAnnotation}
		onupdateannotation={handleUpdateNoteAnnotation}
		canGoBack={navigationHistory.length > 0}
	/>
{/if}

<Toast message={toastMessage} type={toastType} visible={toastVisible} />

<style>
	.sidebar-wrapper {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}
</style>
