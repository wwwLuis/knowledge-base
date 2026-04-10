import Database from '@tauri-apps/plugin-sql';
import type { Note, Tag, NoteWithTags, NoteLink, Folder, FolderTree, Pdf, PdfAnnotation, NoteAnnotation } from './types';

let db: Database | null = null;

export async function getDb(): Promise<Database> {
	if (!db) {
		db = await Database.load('sqlite:knowledge-base.db');
		await initSchema(db);
	}
	return db;
}

async function initSchema(db: Database): Promise<void> {
	await db.execute('PRAGMA foreign_keys = ON');
	await db.execute(`
		CREATE TABLE IF NOT EXISTS notes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			title TEXT NOT NULL DEFAULT '',
			content TEXT NOT NULL DEFAULT '',
			pinned INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`);
	await db.execute(`
		CREATE TABLE IF NOT EXISTS tags (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE
		)
	`);
	await db.execute(`
		CREATE TABLE IF NOT EXISTS note_tags (
			note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
			tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
			PRIMARY KEY (note_id, tag_id)
		)
	`);
	await db.execute(`
		CREATE TABLE IF NOT EXISTS folders (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE
		)
	`);
	// Migration: folder_id Spalte hinzufügen falls noch nicht vorhanden
	try {
		await db.execute('ALTER TABLE notes ADD COLUMN folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL');
	} catch {
		// Spalte existiert bereits
	}
	await db.execute(`
		CREATE TABLE IF NOT EXISTS note_links (
			source_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
			target_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
			PRIMARY KEY (source_id, target_id)
		)
	`);
	await db.execute(`
		CREATE TABLE IF NOT EXISTS pdfs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			filename TEXT NOT NULL,
			stored_name TEXT NOT NULL UNIQUE,
			title TEXT NOT NULL DEFAULT '',
			page_count INTEGER NOT NULL DEFAULT 0,
			file_size INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`);
	await db.execute(`
		CREATE TABLE IF NOT EXISTS pdf_annotations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			pdf_id INTEGER NOT NULL REFERENCES pdfs(id) ON DELETE CASCADE,
			page_number INTEGER NOT NULL,
			color TEXT NOT NULL DEFAULT '#fbbf24',
			rects_json TEXT NOT NULL DEFAULT '[]',
			selected_text TEXT NOT NULL DEFAULT '',
			comment TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`);
	await db.execute(`
		CREATE TABLE IF NOT EXISTS note_annotations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
			color TEXT NOT NULL DEFAULT '#fbbf24',
			selected_text TEXT NOT NULL,
			prefix_context TEXT NOT NULL DEFAULT '',
			suffix_context TEXT NOT NULL DEFAULT '',
			start_offset INTEGER NOT NULL,
			end_offset INTEGER NOT NULL,
			comment TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`);
}

// --- Notes CRUD ---

export async function getNoteById(id: number): Promise<Note | null> {
	const d = await getDb();
	const notes = await d.select<Note[]>('SELECT * FROM notes WHERE id = $1', [id]);
	return notes[0] ?? null;
}

export async function getAllNotes(): Promise<Note[]> {
	const d = await getDb();
	return d.select<Note[]>('SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC');
}

export async function searchNotes(query: string): Promise<Note[]> {
	const d = await getDb();
	const q = `%${query}%`;
	return d.select<Note[]>(
		'SELECT * FROM notes WHERE title LIKE $1 OR content LIKE $1 ORDER BY pinned DESC, updated_at DESC',
		[q]
	);
}

export async function getNotesByTag(tagId: number): Promise<Note[]> {
	const d = await getDb();
	return d.select<Note[]>(
		`SELECT n.* FROM notes n
		 JOIN note_tags nt ON n.id = nt.note_id
		 WHERE nt.tag_id = $1
		 ORDER BY n.pinned DESC, n.updated_at DESC`,
		[tagId]
	);
}

export async function createNote(folderId: number | null = null): Promise<Note> {
	const d = await getDb();
	await d.execute('INSERT INTO notes (title, content, folder_id) VALUES ($1, $2, $3)', ['', '', folderId]);
	const notes = await d.select<Note[]>('SELECT * FROM notes ORDER BY id DESC LIMIT 1');
	return notes[0];
}

export async function moveNoteToFolder(noteId: number, folderId: number | null): Promise<void> {
	const d = await getDb();
	await d.execute('UPDATE notes SET folder_id = $1 WHERE id = $2', [folderId, noteId]);
}

export async function updateNote(id: number, title: string, content: string): Promise<void> {
	const d = await getDb();
	await d.execute(
		"UPDATE notes SET title = $1, content = $2, updated_at = datetime('now') WHERE id = $3",
		[title, content, id]
	);
}

export async function deleteNote(id: number): Promise<void> {
	const d = await getDb();
	await d.execute('DELETE FROM notes WHERE id = $1', [id]);
}

export async function togglePin(id: number, pinned: boolean): Promise<void> {
	const d = await getDb();
	await d.execute('UPDATE notes SET pinned = $1 WHERE id = $2', [pinned ? 1 : 0, id]);
}

// --- Tags ---

export async function getAllTags(): Promise<Tag[]> {
	const d = await getDb();
	return d.select<Tag[]>('SELECT * FROM tags ORDER BY name');
}

export async function getTagsForNote(noteId: number): Promise<Tag[]> {
	const d = await getDb();
	return d.select<Tag[]>(
		`SELECT t.* FROM tags t
		 JOIN note_tags nt ON t.id = nt.tag_id
		 WHERE nt.note_id = $1
		 ORDER BY t.name`,
		[noteId]
	);
}

export async function addTagToNote(noteId: number, tagName: string): Promise<void> {
	const d = await getDb();
	const trimmed = tagName.trim().toLowerCase();
	if (!trimmed) return;

	await d.execute('INSERT OR IGNORE INTO tags (name) VALUES ($1)', [trimmed]);
	const tags = await d.select<Tag[]>('SELECT * FROM tags WHERE name = $1', [trimmed]);
	if (tags.length > 0) {
		await d.execute('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES ($1, $2)', [
			noteId,
			tags[0].id
		]);
	}
}

export async function removeTagFromNote(noteId: number, tagId: number): Promise<void> {
	const d = await getDb();
	await d.execute('DELETE FROM note_tags WHERE note_id = $1 AND tag_id = $2', [noteId, tagId]);
}

// --- Folders ---

export async function getAllFolders(): Promise<Folder[]> {
	const d = await getDb();
	return d.select<Folder[]>('SELECT * FROM folders ORDER BY name');
}

export async function createFolder(name: string, parentId: number | null = null): Promise<Folder> {
	const d = await getDb();
	await d.execute('INSERT INTO folders (name, parent_id) VALUES ($1, $2)', [name, parentId]);
	const folders = await d.select<Folder[]>('SELECT * FROM folders ORDER BY id DESC LIMIT 1');
	return folders[0];
}

export async function renameFolder(id: number, name: string): Promise<void> {
	const d = await getDb();
	await d.execute('UPDATE folders SET name = $1 WHERE id = $2', [name, id]);
}

export async function moveFolderToParent(folderId: number, newParentId: number | null): Promise<void> {
	const d = await getDb();
	await d.execute('UPDATE folders SET parent_id = $1 WHERE id = $2', [newParentId, folderId]);
}

export async function deleteFolder(id: number): Promise<void> {
	const d = await getDb();
	await d.execute('DELETE FROM folders WHERE id = $1', [id]);
}

export function buildFolderTree(folders: Folder[]): FolderTree[] {
	const map = new Map<number, FolderTree>();
	for (const f of folders) {
		map.set(f.id, { ...f, children: [] });
	}
	const roots: FolderTree[] = [];
	for (const f of map.values()) {
		if (f.parent_id && map.has(f.parent_id)) {
			map.get(f.parent_id)!.children.push(f);
		} else {
			roots.push(f);
		}
	}
	return roots;
}

export async function getNotesByFolder(folderId: number | null): Promise<Note[]> {
	const d = await getDb();
	if (folderId === null) {
		return d.select<Note[]>(
			'SELECT * FROM notes WHERE folder_id IS NULL ORDER BY pinned DESC, updated_at DESC'
		);
	}
	return d.select<Note[]>(
		'SELECT * FROM notes WHERE folder_id = $1 ORDER BY pinned DESC, updated_at DESC',
		[folderId]
	);
}

export async function getNotesByFolderAndTag(folderId: number | null, tagId: number): Promise<Note[]> {
	const d = await getDb();
	if (folderId === null) {
		return d.select<Note[]>(
			`SELECT n.* FROM notes n
			 JOIN note_tags nt ON n.id = nt.note_id
			 WHERE nt.tag_id = $1
			 ORDER BY n.pinned DESC, n.updated_at DESC`,
			[tagId]
		);
	}
	return d.select<Note[]>(
		`SELECT n.* FROM notes n
		 JOIN note_tags nt ON n.id = nt.note_id
		 WHERE n.folder_id = $1 AND nt.tag_id = $2
		 ORDER BY n.pinned DESC, n.updated_at DESC`,
		[folderId, tagId]
	);
}

export async function deleteOrphanedTags(): Promise<void> {
	const d = await getDb();
	await d.execute(
		'DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM note_tags)'
	);
}

// --- Note Links ---

export async function getLinksForNote(noteId: number): Promise<NoteLink[]> {
	const d = await getDb();
	const outgoing = await d.select<{ id: number; title: string }[]>(
		`SELECT n.id, n.title FROM notes n
		 JOIN note_links nl ON n.id = nl.target_id
		 WHERE nl.source_id = $1`,
		[noteId]
	);
	const incoming = await d.select<{ id: number; title: string }[]>(
		`SELECT n.id, n.title FROM notes n
		 JOIN note_links nl ON n.id = nl.source_id
		 WHERE nl.target_id = $1`,
		[noteId]
	);
	return [
		...outgoing.map((n) => ({ ...n, direction: 'outgoing' as const })),
		...incoming.map((n) => ({ ...n, direction: 'incoming' as const }))
	];
}

export async function getOutgoingLinkIds(noteId: number): Promise<number[]> {
	const d = await getDb();
	const rows = await d.select<{ target_id: number }[]>(
		'SELECT target_id FROM note_links WHERE source_id = $1',
		[noteId]
	);
	return rows.map((r) => r.target_id);
}

export async function addNoteLink(sourceId: number, targetId: number): Promise<void> {
	if (sourceId === targetId) return;
	const d = await getDb();
	await d.execute('INSERT OR IGNORE INTO note_links (source_id, target_id) VALUES ($1, $2)', [
		sourceId,
		targetId
	]);
}

export async function removeNoteLink(sourceId: number, targetId: number): Promise<void> {
	const d = await getDb();
	await d.execute(
		'DELETE FROM note_links WHERE (source_id = $1 AND target_id = $2) OR (source_id = $2 AND target_id = $1)',
		[sourceId, targetId]
	);
}

export async function removeOutgoingLink(sourceId: number, targetId: number): Promise<void> {
	const d = await getDb();
	await d.execute(
		'DELETE FROM note_links WHERE source_id = $1 AND target_id = $2',
		[sourceId, targetId]
	);
}

// --- PDFs ---

export async function createPdf(filename: string, storedName: string, pageCount: number, fileSize: number): Promise<Pdf> {
	const d = await getDb();
	const title = filename.replace(/\.pdf$/i, '');
	await d.execute(
		'INSERT INTO pdfs (filename, stored_name, title, page_count, file_size) VALUES ($1, $2, $3, $4, $5)',
		[filename, storedName, title, pageCount, fileSize]
	);
	const pdfs = await d.select<Pdf[]>('SELECT * FROM pdfs ORDER BY id DESC LIMIT 1');
	return pdfs[0];
}

export async function getAllPdfs(): Promise<Pdf[]> {
	const d = await getDb();
	return d.select<Pdf[]>('SELECT * FROM pdfs ORDER BY created_at DESC');
}

export async function getPdfById(id: number): Promise<Pdf | null> {
	const d = await getDb();
	const pdfs = await d.select<Pdf[]>('SELECT * FROM pdfs WHERE id = $1', [id]);
	return pdfs[0] ?? null;
}

export async function deletePdf(id: number): Promise<void> {
	const d = await getDb();
	await d.execute('DELETE FROM pdf_annotations WHERE pdf_id = $1', [id]);
	await d.execute('DELETE FROM pdfs WHERE id = $1', [id]);
}

// --- PDF Annotations ---

export async function createPdfAnnotation(pdfId: number, pageNumber: number, color: string, rectsJson: string, selectedText: string, comment: string): Promise<PdfAnnotation> {
	const d = await getDb();
	await d.execute(
		'INSERT INTO pdf_annotations (pdf_id, page_number, color, rects_json, selected_text, comment) VALUES ($1, $2, $3, $4, $5, $6)',
		[pdfId, pageNumber, color, rectsJson, selectedText, comment]
	);
	const rows = await d.select<PdfAnnotation[]>('SELECT * FROM pdf_annotations ORDER BY id DESC LIMIT 1');
	return rows[0];
}

export async function getPdfAnnotations(pdfId: number): Promise<PdfAnnotation[]> {
	const d = await getDb();
	return d.select<PdfAnnotation[]>('SELECT * FROM pdf_annotations WHERE pdf_id = $1 ORDER BY page_number, id', [pdfId]);
}

export async function updatePdfAnnotation(id: number, color: string, comment: string): Promise<void> {
	const d = await getDb();
	await d.execute('UPDATE pdf_annotations SET color = $1, comment = $2 WHERE id = $3', [color, comment, id]);
}

export async function deletePdfAnnotation(id: number): Promise<void> {
	const d = await getDb();
	await d.execute('DELETE FROM pdf_annotations WHERE id = $1', [id]);
}

// --- Note Annotations ---

export async function createNoteAnnotation(noteId: number, color: string, selectedText: string, prefixContext: string, suffixContext: string, startOffset: number, endOffset: number, comment: string): Promise<NoteAnnotation> {
	const d = await getDb();
	await d.execute(
		'INSERT INTO note_annotations (note_id, color, selected_text, prefix_context, suffix_context, start_offset, end_offset, comment) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
		[noteId, color, selectedText, prefixContext, suffixContext, startOffset, endOffset, comment]
	);
	const rows = await d.select<NoteAnnotation[]>('SELECT * FROM note_annotations ORDER BY id DESC LIMIT 1');
	return rows[0];
}

export async function getNoteAnnotations(noteId: number): Promise<NoteAnnotation[]> {
	const d = await getDb();
	return d.select<NoteAnnotation[]>('SELECT * FROM note_annotations WHERE note_id = $1 ORDER BY start_offset', [noteId]);
}

export async function updateNoteAnnotation(id: number, color: string, comment: string): Promise<void> {
	const d = await getDb();
	await d.execute('UPDATE note_annotations SET color = $1, comment = $2 WHERE id = $3', [color, comment, id]);
}

export async function deleteNoteAnnotation(id: number): Promise<void> {
	const d = await getDb();
	await d.execute('DELETE FROM note_annotations WHERE id = $1', [id]);
}

// --- Export / Import ---

export interface ExportData {
	version: 1;
	exportedAt: string;
	notes: Note[];
	tags: Tag[];
	noteTags: { note_id: number; tag_id: number }[];
	folders: Folder[];
	noteLinks: { source_id: number; target_id: number }[];
}

export async function exportAllData(): Promise<ExportData> {
	const d = await getDb();
	const notes = await d.select<Note[]>('SELECT * FROM notes');
	const tags = await d.select<Tag[]>('SELECT * FROM tags');
	const noteTags = await d.select<{ note_id: number; tag_id: number }[]>('SELECT * FROM note_tags');
	const folders = await d.select<Folder[]>('SELECT * FROM folders');
	const noteLinks = await d.select<{ source_id: number; target_id: number }[]>('SELECT * FROM note_links');
	return {
		version: 1,
		exportedAt: new Date().toISOString(),
		notes,
		tags,
		noteTags,
		folders,
		noteLinks
	};
}

export async function importAllData(data: ExportData): Promise<void> {
	const d = await getDb();
	// Alles löschen
	await d.execute('DELETE FROM note_links');
	await d.execute('DELETE FROM note_tags');
	await d.execute('DELETE FROM notes');
	await d.execute('DELETE FROM tags');
	await d.execute('DELETE FROM folders');

	// Folders einfügen (erst ohne parent_id, dann updaten)
	for (const f of data.folders) {
		await d.execute('INSERT INTO folders (id, name, parent_id) VALUES ($1, $2, NULL)', [f.id, f.name]);
	}
	for (const f of data.folders) {
		if (f.parent_id !== null) {
			await d.execute('UPDATE folders SET parent_id = $1 WHERE id = $2', [f.parent_id, f.id]);
		}
	}

	// Notes einfügen
	for (const n of data.notes) {
		await d.execute(
			'INSERT INTO notes (id, title, content, pinned, folder_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
			[n.id, n.title, n.content, n.pinned, n.folder_id, n.created_at, n.updated_at]
		);
	}

	// Tags einfügen
	for (const t of data.tags) {
		await d.execute('INSERT INTO tags (id, name) VALUES ($1, $2)', [t.id, t.name]);
	}

	// Verknüpfungen
	for (const nt of data.noteTags) {
		await d.execute('INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2)', [nt.note_id, nt.tag_id]);
	}

	for (const nl of data.noteLinks) {
		await d.execute('INSERT INTO note_links (source_id, target_id) VALUES ($1, $2)', [nl.source_id, nl.target_id]);
	}
}
