<script lang="ts">
	import { onMount } from 'svelte';
	import type { FolderTree } from '$lib/types';

	let {
		folders,
		activeFolderId,
		onselect,
		oncreate,
		onrename,
		ondelete,
		onnotedrop,
		onfoldermove
	}: {
		folders: FolderTree[];
		activeFolderId: number | null;
		onselect: (folderId: number | null) => void;
		oncreate: (parentId: number | null) => void;
		onrename: (id: number, name: string) => void;
		ondelete: (id: number) => void;
		onnotedrop?: (noteId: number, folderId: number | null) => void;
		onfoldermove?: (folderId: number, newParentId: number | null) => void;
	} = $props();

	let editingId = $state<number | null>(null);
	let editingName = $state('');
	let showContextMenu = $state<{ id: number | null; x: number; y: number } | null>(null);
	let expandedFolders = $state<Set<number>>(new Set());

	function toggleExpand(id: number) {
		const next = new Set(expandedFolders);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		expandedFolders = next;
	}

	function startRename(id: number, currentName: string) {
		editingId = id;
		editingName = currentName;
		showContextMenu = null;
	}

	function commitRename() {
		if (editingId !== null && editingName.trim()) {
			onrename(editingId, editingName.trim());
		}
		editingId = null;
	}

	function handleRenameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			commitRename();
		} else if (e.key === 'Escape') {
			editingId = null;
		}
	}

	onMount(() => {
		const handler = () => closeContextMenu();
		window.addEventListener('close-all-context-menus', handler);
		return () => window.removeEventListener('close-all-context-menus', handler);
	});

	function handleContextMenu(e: MouseEvent, id: number | null) {
		e.preventDefault();
		e.stopPropagation();
		window.dispatchEvent(new CustomEvent('close-all-context-menus'));
		showContextMenu = { id, x: e.clientX, y: e.clientY };
	}

	function closeContextMenu() {
		showContextMenu = null;
	}

	function findFolder(list: FolderTree[], id: number): FolderTree | null {
		for (const f of list) {
			if (f.id === id) return f;
			const found = findFolder(f.children, id);
			if (found) return found;
		}
		return null;
	}

	let dragOverId = $state<number | null | 'root'>(null);

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
	}

	function handleDrop(e: DragEvent, folderId: number | null) {
		e.preventDefault();
		dragOverId = null;
		const noteId = e.dataTransfer?.getData('application/note-id');
		const srcFolderId = e.dataTransfer?.getData('application/folder-id');
		if (noteId && onnotedrop) {
			onnotedrop(Number(noteId), folderId);
		} else if (srcFolderId && onfoldermove) {
			const id = Number(srcFolderId);
			if (id !== folderId) {
				onfoldermove(id, folderId);
			}
		}
	}

	function handleFolderDragStart(e: DragEvent, folderId: number) {
		e.dataTransfer?.setData('application/folder-id', String(folderId));
	}
</script>

<svelte:window onclick={closeContextMenu} oncontextmenu={closeContextMenu} />

<div class="folder-tree">
	<div class="folder-header">
		<span class="folder-header-label">Ordner</span>
		<button class="folder-add-btn" onclick={() => oncreate(null)} title="Neuer Ordner">
			<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
				<path d="M12 5v14M5 12h14"/>
			</svg>
		</button>
	</div>

	<button
		class="folder-item root"
		class:active={activeFolderId === null}
		class:drag-over={dragOverId === 'root'}
		onclick={() => onselect(null)}
		ondragover={handleDragOver}
		ondragenter={() => (dragOverId = 'root')}
		ondragleave={() => { if (dragOverId === 'root') dragOverId = null; }}
		ondrop={(e) => handleDrop(e, null)}
	>
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
			<polyline points="9,22 9,12 15,12 15,22"/>
		</svg>
		<span>Alle Notizen</span>
	</button>

	{#snippet folderNode(folder: FolderTree, depth: number)}
		<div class="folder-row" style="padding-left: {12 + depth * 18}px">
			{#if folder.children.length > 0}
				<button class="folder-chevron" class:expanded={expandedFolders.has(folder.id)} onclick={() => toggleExpand(folder.id)}>
					<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="9 18 15 12 9 6"/>
					</svg>
				</button>
			{:else}
				<span class="folder-chevron-spacer"></span>
			{/if}
			{#if editingId === folder.id}
				<input
					type="text"
					class="folder-rename-input"
					bind:value={editingName}
					onblur={commitRename}
					onkeydown={handleRenameKeydown}
					autofocus
				/>
			{:else}
				<button
					class="folder-item"
					class:active={activeFolderId === folder.id}
					class:drag-over={dragOverId === folder.id}
					onclick={() => onselect(folder.id)}
					oncontextmenu={(e) => handleContextMenu(e, folder.id)}
					draggable="true"
					ondragstart={(e) => handleFolderDragStart(e, folder.id)}
					ondragover={handleDragOver}
					ondragenter={() => (dragOverId = folder.id)}
					ondragleave={() => { if (dragOverId === folder.id) dragOverId = null; }}
					ondrop={(e) => handleDrop(e, folder.id)}
				>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
					</svg>
					<span>{folder.name}</span>
				</button>
			{/if}
		</div>
		{#if folder.children.length > 0 && expandedFolders.has(folder.id)}
			{#each folder.children as child (child.id)}
				{@render folderNode(child, depth + 1)}
			{/each}
		{/if}
	{/snippet}

	{#each folders as folder (folder.id)}
		{@render folderNode(folder, 0)}
	{/each}
</div>

{#if showContextMenu}
	<div class="context-menu" style="left: {showContextMenu.x}px; top: {showContextMenu.y}px">
		<button onclick={() => { oncreate(showContextMenu!.id); showContextMenu = null; }}>
			Unterordner erstellen
		</button>
		{#if showContextMenu.id !== null}
			<button onclick={() => {
				const f = findFolder(folders, showContextMenu!.id!);
				if (f) startRename(f.id, f.name);
			}}>
				Umbenennen
			</button>
			<button class="delete-option" onclick={() => { ondelete(showContextMenu!.id!); showContextMenu = null; }}>
				Löschen
			</button>
		{/if}
	</div>
{/if}

<style>
	.folder-tree {
		border-bottom: 1px solid var(--gray-200);
		padding-bottom: 4px;
	}

	.folder-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px 6px;
	}

	.folder-header-label {
		font-size: 10.5px;
		font-weight: 600;
		color: var(--gray-400);
		text-transform: uppercase;
		letter-spacing: 0.8px;
	}

	.folder-add-btn {
		width: 22px;
		height: 22px;
		border-radius: var(--radius-sm);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--gray-400);
		transition: all var(--transition-fast);
	}

	.folder-add-btn:hover {
		background: var(--gray-200);
		color: var(--gray-600);
	}

	.folder-item {
		width: 100%;
		padding: 5px 14px;
		background: transparent;
		text-align: left;
		cursor: pointer;
		font-size: 13px;
		color: var(--gray-600);
		display: flex;
		align-items: center;
		gap: 7px;
		border-radius: 0;
		transition: all var(--transition-fast);
	}

	.folder-item span {
		line-height: 1;
	}

	.folder-item:hover {
		background: var(--gray-100);
		color: var(--gray-800);
	}

	.folder-item.active {
		background: var(--primary-50);
		color: var(--primary-700);
	}

	.folder-item.active svg {
		stroke: var(--primary-500);
	}

	.folder-item.drag-over {
		background: var(--primary-100);
		outline: 2px dashed var(--primary-400);
		outline-offset: -2px;
	}

	.folder-item.root {
		padding: 5px 14px;
	}

	.folder-row {
		display: flex;
		align-items: center;
	}

	.folder-chevron {
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: var(--gray-400);
		border-radius: var(--radius-sm);
		transition: transform var(--transition-fast), color var(--transition-fast);
	}

	.folder-chevron:hover {
		color: var(--gray-600);
	}

	.folder-chevron.expanded {
		transform: rotate(90deg);
	}

	.folder-chevron-spacer {
		width: 16px;
		flex-shrink: 0;
	}

	.folder-rename-input {
		flex: 1;
		padding: 3px 8px;
		border: 1px solid var(--primary-400);
		border-radius: var(--radius-sm);
		font-size: 13px;
		outline: none;
		box-shadow: 0 0 0 3px var(--primary-50);
	}

	.context-menu {
		position: fixed;
		background: var(--bg);
		border: 1px solid var(--gray-200);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		z-index: 100;
		min-width: 170px;
		overflow: hidden;
		padding: 4px;
	}

	.context-menu button {
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

	.context-menu button:hover {
		background: var(--gray-100);
	}

	.context-menu .delete-option {
		color: var(--rose-500);
	}

	.context-menu .delete-option:hover {
		background: var(--rose-50);
	}
</style>
