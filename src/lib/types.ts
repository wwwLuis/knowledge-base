export interface Folder {
	id: number;
	name: string;
	parent_id: number | null;
}

export interface FolderTree extends Folder {
	children: FolderTree[];
}

export interface Note {
	id: number;
	title: string;
	content: string;
	pinned: number;
	folder_id: number | null;
	created_at: string;
	updated_at: string;
}

export interface Tag {
	id: number;
	name: string;
}

export interface NoteWithTags extends Note {
	tags: Tag[];
}

export interface NoteLink {
	id: number;
	title: string;
	direction: 'outgoing' | 'incoming';
}

export interface Pdf {
	id: number;
	filename: string;
	stored_name: string;
	title: string;
	page_count: number;
	file_size: number;
	created_at: string;
}

export interface PdfAnnotation {
	id: number;
	pdf_id: number;
	page_number: number;
	color: string;
	rects_json: string;
	selected_text: string;
	comment: string;
	created_at: string;
}

export interface NoteAnnotation {
	id: number;
	note_id: number;
	color: string;
	selected_text: string;
	prefix_context: string;
	suffix_context: string;
	start_offset: number;
	end_offset: number;
	comment: string;
	created_at: string;
}
