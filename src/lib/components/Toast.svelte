<script lang="ts">
	let {
		message,
		type = 'info',
		visible
	}: {
		message: string;
		type?: 'info' | 'success' | 'warning';
		visible: boolean;
	} = $props();
</script>

{#if visible}
	<div class="toast" class:success={type === 'success'} class:warning={type === 'warning'}>
		{#if type === 'success'}
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="20 6 9 17 4 12"/>
			</svg>
		{:else if type === 'warning'}
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
				<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
			</svg>
		{:else}
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
			</svg>
		{/if}
		<span>{message}</span>
	</div>
{/if}

<style>
	.toast {
		position: fixed;
		bottom: 20px;
		right: 20px;
		z-index: 200;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 16px;
		border-radius: var(--radius-md);
		background: var(--gray-800);
		color: var(--gray-100);
		font-size: 13px;
		box-shadow: var(--shadow-lg);
		animation: toast-in 200ms ease-out;
		max-width: 400px;
	}

	.toast.success {
		background: var(--accent-500);
		color: white;
	}

	.toast.warning {
		background: var(--amber-500);
		color: white;
	}

	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
