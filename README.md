<p align="center">
  <img src="static/knowledge-base-logo.png" width="100" alt="Knowledge Base Logo" />
</p>

<h1 align="center">Knowledge Base</h1>

<p align="center">
  <strong>Your personal desktop app for notes & documents.</strong><br/>
  Write notes, read PDFs, annotate, link, and organize — fully offline, all in one place.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-6366f1?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/Tauri-2-24C8D8?style=flat-square&logo=tauri&logoColor=white" alt="Tauri" />
  <img src="https://img.shields.io/badge/Svelte-5-FF3E00?style=flat-square&logo=svelte&logoColor=white" alt="Svelte" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License" />
</p>

---

## What is Knowledge Base?

Knowledge Base is a lightweight, offline-first desktop application for personal knowledge management. Write and format notes in Markdown, read and annotate PDFs, organize everything in a nested folder hierarchy, connect notes with bidirectional wiki-links, and filter your knowledge base instantly by tags.

**Fully offline.** All data is stored locally in a SQLite database (`knowledge-base.db`) in your app data directory — no cloud, no tracking, full control.

---

## Features

### Note Editor

Write notes in plain Markdown with a live **preview mode**. The editor supports:

- Text highlighting in **6 colors** (yellow, teal, sky, rose, purple, orange) with inline comments
- Wiki-link autocomplete — type `[[` to link to another note, `[[pdf:` to reference a PDF
- Navigation history (back button)
- Pin important notes to the top of the list

### PDF Viewer

Upload PDF files and read them directly in the app:

- Page-by-page navigation
- Select regions and **highlight them** with any of the 6 highlight colors
- Add **comments** to each highlight
- All annotations persist in the database across sessions

### Folder Tree

Organize your notes in a hierarchical folder structure:

- Unlimited nesting depth
- Drag-and-drop to reorder
- Rename and delete folders
- Move notes between folders

### Tagging System

Add one or more tags to any note:

| Feature | Description |
|---------|-------------|
| **Autocomplete** | Suggestions from existing tags as you type |
| **Tag Filter** | Click any tag to filter the note list instantly |
| **Combined Filter** | Tag filter and folder filter work together |
| **Cleanup** | Orphaned tags (no associated notes) are removed automatically |

### Bidirectional Linking

Connect notes using `[[note-title]]` or `[[id:123]]` syntax:

- Links are **auto-synced** when a note is renamed
- The **NoteLinks** panel shows all incoming and outgoing links for the active note
- Click any link to navigate directly to the referenced note

### Annotations

Two types of annotations are supported, both stored in SQLite:

| Type | How it works |
|------|-------------|
| **Note annotations** | Select text in a note → pick a color → optionally add a comment |
| **PDF annotations** | Select a region on a PDF page → pick a color → optionally add a comment |

All annotations can be edited or deleted from the annotation sidebar.

### Search

Full-text search across note titles and content. Results update as you type.

### Dark & Light Theme

Toggle between themes with a single button. Your preference is persisted in localStorage and synced to the native title bar.

### Global Shortcut

**`Ctrl + 3`** toggles the app window — no matter which window currently has focus.

---

## How Does It Work?

```
+---------------------+    +---------------------------+
|     NoteList        |    |       Main Area           |
|  (Sidebar)          |    |                           |
|                     |    |  +---------------------+  |
|  Search             |--->|  | NoteEditor          |  |
|  Folder Tree        |    |  |                     |  |
|  Tag Filter         |    |  | Markdown + Preview  |  |
|  PDF List           |    |  | Highlights          |  |
|  Pin / Bulk Delete  |    |  | Wiki-Links          |  |
|                     |--->|  +---------------------+  |
|                     |    |  | PdfViewer           |  |
|                     |    |  |                     |  |
|                     |    |  | Pages + Annotations |  |
+---------------------+    +---------------------------+
```

### Workflow

1. **Create a note or upload a PDF** — Click the new note button or import a PDF from your file system.
2. **Organize** — Assign the note to a folder and add tags.
3. **Annotate & link** — Highlight important passages, add comments, and link related notes with `[[wiki-links]]`.
4. **Search & filter** — Use full-text search, tag filters, or the folder tree to find anything instantly.

---

## Data Storage

All data is stored in a local **SQLite** database (`sqlite:knowledge-base.db`).

| Table | Content |
|-------|---------|
| `notes` | Title, content (Markdown), pinned flag, folder_id, created/updated timestamps |
| `tags` | Unique tag names |
| `note_tags` | Note ↔ Tag junction (many-to-many) |
| `folders` | Folder names and hierarchy via `parent_id` |
| `note_links` | Bidirectional references between notes |
| `pdfs` | PDF metadata — original filename, UUID-based stored name, page count, file size |
| `pdf_annotations` | Region highlights on PDFs — page, color, bounding box (JSON), selected text, comment |
| `note_annotations` | Text highlights in notes — color, character offset, surrounding context, comment |

PDF files themselves are stored in the Tauri app data directory using UUID filenames.

---

## Tech Stack & Architecture

### Architecture Overview

```
+--------------------------------------------+
| Tauri Shell                                |
|                                            |
|  +--------------------------------------+  |
|  | Svelte Frontend                      |  |
|  |                                      |  |
|  |  SvelteKit <--> Svelte 5 Runes       |  |
|  |  (Routing)      (Reactive State)     |  |
|  |      |               |               |  |
|  |      v               v               |  |
|  |  Components        SQLite            |  |
|  |  (UI Layer)     (via plugin-sql)     |  |
|  +--------------------------------------+  |
|                    ^                       |
|                    | IPC (minimal)         |
|  +--------------------------------------+  |
|  | Rust Backend                         |  |
|  |                                      |  |
|  |  Window Management                   |  |
|  |  Global Shortcut (Ctrl+3)            |  |
|  |  Native Title Bar & Theme Sync       |  |
|  |  File System Access (PDF storage)    |  |
|  +--------------------------------------+  |
+--------------------------------------------+
```

### Frontend

| Technology | Version | Role |
|------------|---------|------|
| **Svelte** | 5 | Reactive UI — components, runes-based state (`$state`, `$derived`) |
| **SvelteKit** | 2.9 | Meta-framework with static adapter (SPA mode, SSR disabled) |
| **TypeScript** | 5.6 | Type safety for interfaces, DB functions, and utilities |
| **Vite** | 6 | Dev server with HMR and optimized production builds |
| **marked** | 18 | Markdown-to-HTML rendering (GFM mode) |
| **pdfjs-dist** | 5.6 | PDF rendering on canvas |
| **DOMPurify** | 3 | HTML sanitization for rendered Markdown |

**State management** is handled with Svelte 5 runes directly in `+page.svelte`. The `db.ts` module (495 lines) encapsulates all SQLite operations — CRUD for notes, folders, tags, PDFs, annotations, and links — keeping components free of raw SQL.

**View routing** uses a simple `view` state variable (`"notes" | "pdf"`) — no URL routing needed for a single-window desktop tool.

### Backend (Rust / Tauri)

| Technology | Version | Role |
|------------|---------|------|
| **Tauri** | 2 | Desktop runtime — bundles the frontend into a native window |
| **Rust** | Edition 2021 | Compiled backend for window control and shortcut handling |
| **tauri-plugin-sql** | 2 | SQLite database access from the frontend |
| **tauri-plugin-fs** | 2 | File system access for PDF storage |
| **tauri-plugin-global-shortcut** | 2 | System-wide `Ctrl+3` shortcut |
| **tauri-plugin-opener** | 2 | Open external links in the default browser |

The Rust backend is intentionally minimal — only handles what a pure web frontend cannot:

- **Global shortcut** (`Ctrl+3`): Registers system-wide and toggles the app window
- **Theme sync**: Sets the native title bar theme to match the app theme
- **Plugin initialization**: Activates `sql`, `fs`, `opener`, and `global-shortcut` on startup

All business logic — notes, folders, tags, PDFs, annotations, links — runs entirely in the frontend.

### How They Work Together

1. **Tauri** launches a native window (1000×700 px) and loads the **SvelteKit** frontend built by **Vite**
2. **SvelteKit** renders the UI as a single-page app (static adapter, SSR disabled)
3. On startup, `db.ts` initializes the SQLite database and creates all tables if they don't exist
4. User interactions flow through **Svelte components** → **`db.ts` mutations** → **SQLite persistence**
5. For native features (shortcut, title bar, file system), the frontend communicates with the **Rust backend** via **Tauri IPC**

---

## Project Structure

```
knowledge-base/
├── src/                              # Frontend source code
│   ├── routes/                       # SvelteKit pages
│   │   ├── +page.svelte              # Main app — state, layout, view routing
│   │   ├── +layout.svelte            # Theme setup & DB initialization
│   │   └── +layout.ts                # SPA configuration (SSR disabled)
│   ├── lib/                          # Components, state & utilities
│   │   ├── db.ts                     # All SQLite operations (notes, folders, tags, PDFs, annotations, links)
│   │   ├── types.ts                  # TypeScript interfaces
│   │   ├── utils.ts                  # Utility functions
│   │   ├── theme.svelte.ts           # Dark/light theme management (Svelte runes)
│   │   └── components/
│   │       ├── NoteEditor.svelte     # Markdown editor, highlights, wiki-links, annotations
│   │       ├── NoteList.svelte       # Sidebar — search, pin, bulk delete, PDF list, import/export
│   │       ├── PdfViewer.svelte      # PDF rendering, page navigation, region highlights
│   │       ├── FolderTree.svelte     # Hierarchical folder navigation with drag-and-drop
│   │       ├── TagInput.svelte       # Add/remove tags with autocomplete
│   │       ├── TagFilter.svelte      # Filter note list by tag
│   │       ├── NoteLinks.svelte      # Incoming & outgoing bidirectional links panel
│   │       ├── HighlightToolbar.svelte # Context menu for highlight color selection
│   │       └── Toast.svelte          # Notification system (info, success, warning)
│   ├── app.css                       # Global styles (light/dark themes, color palette)
│   └── app.html                      # HTML shell
│
├── src-tauri/                        # Rust backend
│   ├── src/
│   │   ├── main.rs                   # Entry point
│   │   └── lib.rs                    # App setup (plugins, shortcut, theme sync)
│   ├── Cargo.toml                    # Rust dependencies
│   ├── tauri.conf.json               # App configuration (window, icons, app ID)
│   ├── icons/                        # App icons (PNG, ICO, ICNS)
│   └── capabilities/                 # Tauri security policies
│
├── static/                           # Static assets (logo, etc.)
├── package.json                      # Scripts & frontend dependencies
├── vite.config.js                    # Vite configuration
├── svelte.config.js                  # SvelteKit configuration
├── tsconfig.json                     # TypeScript configuration
└── LICENSE                           # MIT License
```

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri CLI](https://tauri.app/start/)

### Getting Started

```bash
# Install dependencies
npm install

# Start frontend dev server only (http://localhost:1420)
npm run dev

# Start full desktop app in dev mode (with hot-reloading)
npm run tauri dev
```

### Building

```bash
# Build frontend only
npm run build

# Build complete desktop app (installer + executable)
npm run tauri build
```

### Type Checking

```bash
npm run check          # One-time
npm run check:watch    # Continuous
```

---

## License

MIT — see [LICENSE](LICENSE)

<p align="center"><sub>Built with Tauri, Svelte, and a pinch of Rust.</sub></p>
