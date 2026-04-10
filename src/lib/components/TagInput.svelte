<script lang="ts">
	import { tick } from 'svelte';
	import type { Tag } from '$lib/types';

	let {
		tags,
		allTags = [],
		onadd,
		onremove
	}: {
		tags: Tag[];
		allTags?: Tag[];
		onadd: (name: string) => void;
		onremove: (tagId: number) => void;
	} = $props();

	let newTag = $state('');
	let showSuggestions = $state(false);
	let selectedIndex = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);
	let suggestionsPos = $state({ top: 0, left: 0 });

	let suggestions = $derived(
		newTag.trim() === ''
			? []
			: allTags
					.filter(
						(t) =>
							t.name.toLowerCase().includes(newTag.trim().toLowerCase()) &&
							!tags.some((existing) => existing.id === t.id)
					)
					.slice(0, 6)
	);

	function updateSuggestionsPos() {
		if (!inputEl) return;
		const rect = inputEl.getBoundingClientRect();
		suggestionsPos = {
			top: rect.top,
			left: rect.left
		};
	}

	function handleInput() {
		showSuggestions = newTag.trim().length > 0 && suggestions.length > 0;
		selectedIndex = 0;
		if (showSuggestions) {
			tick().then(updateSuggestionsPos);
		}
	}

	function handleFocus() {
		handleInput();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (showSuggestions && suggestions.length > 0) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				selectedIndex = (selectedIndex + 1) % suggestions.length;
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				selectedIndex = (selectedIndex - 1 + suggestions.length) % suggestions.length;
				return;
			}
			if (e.key === 'Tab' || (e.key === 'Enter' && suggestions.length > 0)) {
				e.preventDefault();
				selectSuggestion(suggestions[selectedIndex].name);
				return;
			}
			if (e.key === 'Escape') {
				showSuggestions = false;
				return;
			}
		}
		if (e.key === 'Enter' && newTag.trim()) {
			e.preventDefault();
			onadd(newTag.trim());
			newTag = '';
			showSuggestions = false;
		}
	}

	function selectSuggestion(name: string) {
		onadd(name);
		newTag = '';
		showSuggestions = false;
	}
</script>

<div class="tag-input-wrapper">
	<div class="tag-input">
		{#each tags as tag (tag.id)}
			<span class="tag-pill">
				{tag.name}
				<button class="tag-remove" onclick={() => onremove(tag.id)}>&times;</button>
			</span>
		{/each}
		<input
			type="text"
			placeholder="Tag hinzufügen..."
			bind:value={newTag}
			bind:this={inputEl}
			onkeydown={handleKeydown}
			oninput={handleInput}
			onfocus={handleFocus}
			onblur={() => setTimeout(() => (showSuggestions = false), 150)}
			class="tag-text-input"
		/>
	</div>
	{#if showSuggestions && suggestions.length > 0}
		<div class="tag-suggestions" style="top: {suggestionsPos.top}px; left: {suggestionsPos.left}px;">
			{#each suggestions as suggestion, i (suggestion.id)}
				<button
					class="tag-suggestion-item"
					class:active={i === selectedIndex}
					onmousedown={(e) => { e.preventDefault(); selectSuggestion(suggestion.name); }}
					onmouseenter={() => (selectedIndex = i)}
				>
					{suggestion.name}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.tag-input-wrapper {
		position: relative;
	}

	.tag-input {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		align-items: center;
		padding: 6px 0;
	}

	.tag-pill {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 3px 10px;
		background: var(--accent-50);
		border: 1px solid var(--accent-100);
		border-radius: var(--radius-full);
		font-size: 11.5px;
		color: var(--accent-600);
		line-height: 1;
		transition: all var(--transition-fast);
	}

	.tag-pill:hover {
		background: var(--accent-100);
	}

	.tag-remove {
		border: none;
		background: none;
		color: var(--accent-400);
		font-size: 14px;
		padding: 0 1px;
		line-height: 1;
		display: flex;
		align-items: center;
		transition: color var(--transition-fast);
	}

	.tag-remove:hover {
		color: var(--rose-500);
	}

	.tag-text-input {
		border: none;
		outline: none;
		padding: 3px 6px;
		font-size: 12px;
		background: transparent;
		min-width: 100px;
		color: var(--gray-600);
	}

	.tag-text-input::placeholder {
		color: var(--gray-400);
	}

	.tag-suggestions {
		position: fixed;
		transform: translateY(-100%);
		margin-top: -4px;
		background: var(--bg);
		border: 1px solid var(--gray-200);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		z-index: 9999;
		min-width: 160px;
		max-width: 280px;
		padding: 4px;
	}

	.tag-suggestion-item {
		width: 100%;
		padding: 5px 10px;
		background: transparent;
		text-align: left;
		font-size: 12px;
		color: var(--gray-700);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.tag-suggestion-item:hover,
	.tag-suggestion-item.active {
		background: var(--accent-50);
		color: var(--accent-700);
	}
</style>
