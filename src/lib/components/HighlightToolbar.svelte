<script lang="ts">
	let {
		x,
		y,
		onhighlight,
		onclose
	}: {
		x: number;
		y: number;
		onhighlight: (color: string, comment: string) => void;
		onclose: () => void;
	} = $props();

	const colors = [
		{ value: '#fbbf24', label: 'Gelb' },
		{ value: '#34d399', label: 'Grün' },
		{ value: '#60a5fa', label: 'Blau' },
		{ value: '#f472b6', label: 'Pink' },
		{ value: '#fb923c', label: 'Orange' }
	];

	let selectedColor = $state('#fbbf24');
	let comment = $state('');
	let showComment = $state(false);

	function handleSave() {
		onhighlight(selectedColor, comment.trim());
		comment = '';
		showComment = false;
	}
</script>

<svelte:window onclick={onclose} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="highlight-toolbar"
	style="left: {x}px; top: {y}px;"
	onclick={(e) => e.stopPropagation()}
	onmousedown={(e) => e.stopPropagation()}
>
	<div class="color-row">
		{#each colors as color (color.value)}
			<button
				class="color-btn"
				class:active={selectedColor === color.value}
				style="background: {color.value}"
				title={color.label}
				onclick={() => { selectedColor = color.value; if (!showComment) handleSave(); }}
			></button>
		{/each}
		<button
			class="comment-toggle"
			class:active={showComment}
			title="Kommentar hinzufügen"
			onclick={() => (showComment = !showComment)}
		>
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
			</svg>
		</button>
	</div>
	{#if showComment}
		<div class="comment-section">
			<textarea
				class="comment-input"
				placeholder="Kommentar..."
				bind:value={comment}
				rows="2"
			></textarea>
			<button class="save-btn" onclick={handleSave}>
				Speichern
			</button>
		</div>
	{/if}
</div>

<style>
	.highlight-toolbar {
		position: fixed;
		z-index: 9999;
		background: var(--bg);
		border: 1px solid var(--gray-200);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		padding: 6px;
		transform: translateX(-50%) translateY(-100%);
		margin-top: -8px;
	}

	.color-row {
		display: flex;
		gap: 4px;
		align-items: center;
	}

	.color-btn {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.color-btn:hover {
		transform: scale(1.15);
	}

	.color-btn.active {
		border-color: var(--gray-800);
		box-shadow: 0 0 0 2px var(--bg);
	}

	.comment-toggle {
		width: 22px;
		height: 22px;
		border-radius: var(--radius-sm);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--gray-400);
		margin-left: 2px;
		transition: all var(--transition-fast);
	}

	.comment-toggle:hover,
	.comment-toggle.active {
		color: var(--gray-700);
		background: var(--gray-100);
	}

	.comment-section {
		margin-top: 6px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.comment-input {
		width: 200px;
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

	.comment-input:focus {
		border-color: var(--primary-400);
	}

	.save-btn {
		padding: 4px 10px;
		background: var(--primary-500);
		color: white;
		border-radius: var(--radius-sm);
		font-size: 11px;
		font-weight: 500;
		transition: background var(--transition-fast);
		align-self: flex-end;
	}

	.save-btn:hover {
		background: var(--primary-600);
	}
</style>
