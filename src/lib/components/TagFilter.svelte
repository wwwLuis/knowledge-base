<script lang="ts">
	import type { Tag } from '$lib/types';

	let {
		tags,
		activeTagId,
		onselect
	}: {
		tags: Tag[];
		activeTagId: number | null;
		onselect: (tagId: number | null) => void;
	} = $props();

	let expanded = $state(false);
</script>

{#if tags.length > 0}
	<div class="tag-filter">
		<button class="tag-filter-header" onclick={() => (expanded = !expanded)}>
			<svg class="chevron" class:expanded width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="9 18 15 12 9 6"/>
			</svg>
			<span class="tag-filter-label">Kategorien</span>
			{#if activeTagId}
				<span class="active-indicator"></span>
			{/if}
			<span class="tag-count">{tags.length}</span>
		</button>

		{#if expanded}
			<div class="tag-pills">
				{#each tags as tag (tag.id)}
					<button
						class="filter-pill"
						class:active={tag.id === activeTagId}
						onclick={() => onselect(tag.id === activeTagId ? null : tag.id)}
					>
						{tag.name}
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.tag-filter {
		border-bottom: 1px solid var(--gray-200);
	}

	.tag-filter-header {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		color: var(--gray-400);
		transition: color var(--transition-fast);
	}

	.tag-filter-header:hover {
		color: var(--gray-600);
	}

	.tag-filter-label {
		font-size: 10.5px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.8px;
	}

	.tag-count {
		font-size: 10px;
		background: var(--gray-200);
		color: var(--gray-500);
		padding: 1px 6px;
		border-radius: var(--radius-full);
		margin-left: auto;
		line-height: 1.2;
	}

	.active-indicator {
		width: 6px;
		height: 6px;
		border-radius: var(--radius-full);
		background: var(--accent-500);
		flex-shrink: 0;
	}

	.chevron {
		flex-shrink: 0;
		transition: transform var(--transition-fast);
	}

	.chevron.expanded {
		transform: rotate(90deg);
	}

	.tag-pills {
		padding: 0 14px 8px;
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		max-height: 100px;
		overflow-y: auto;
	}

	.filter-pill {
		padding: 3px 10px;
		border: 1px solid var(--gray-200);
		border-radius: var(--radius-full);
		background: var(--bg);
		font-size: 11px;
		color: var(--gray-600);
		line-height: 1;
		display: flex;
		align-items: center;
		white-space: nowrap;
		transition: all var(--transition-fast);
	}

	.filter-pill:hover {
		background: var(--gray-100);
		color: var(--gray-800);
		border-color: var(--gray-300);
	}

	.filter-pill.active {
		background: var(--accent-500);
		color: white;
		border-color: var(--accent-500);
	}

	.filter-pill.active:hover {
		background: var(--accent-600);
		border-color: var(--accent-600);
	}
</style>
