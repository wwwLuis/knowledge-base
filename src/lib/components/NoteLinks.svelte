<script lang="ts">
	import type { NoteLink } from '$lib/types';

	let {
		links,
		onnavigate
	}: {
		links: NoteLink[];
		onnavigate: (id: number) => void;
	} = $props();
</script>

<div class="note-links">
	{#if links.length > 0}
		<div class="links-list">
			{#each links as link (link.id + link.direction)}
				<div class="link-item">
					<span class="link-direction" title={link.direction === 'outgoing' ? 'Verlinkt auf' : 'Verlinkt von'}>
						{link.direction === 'outgoing' ? '\u2192' : '\u2190'}
					</span>
					<button class="link-name" onclick={() => onnavigate(link.id)}>
						{link.title || 'Untitled'}
					</button>
				</div>
			{/each}
		</div>
	{:else}
		<div class="links-empty">Keine Verlinkungen</div>
	{/if}
</div>

<style>
	.note-links {
		padding: 4px 0;
	}

	.links-list {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.link-item {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		padding: 3px 0;
		border-radius: var(--radius-sm);
		transition: background var(--transition-fast);
	}

	.link-item:hover {
		background: var(--gray-100);
	}

	.link-direction {
		color: var(--gray-400);
		font-size: 11px;
		flex-shrink: 0;
	}

	.link-name {
		border: none;
		background: none;
		color: var(--primary-600);
		cursor: pointer;
		padding: 0;
		font-size: 12px;
		text-align: left;
		transition: color var(--transition-fast);
	}

	.link-name:hover {
		color: var(--primary-700);
		text-decoration: underline;
	}

	.links-empty {
		font-size: 12px;
		color: var(--gray-400);
	}
</style>
