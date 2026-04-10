<script lang="ts">
	import '@fontsource/inter/300.css';
	import '@fontsource/inter/400.css';
	import '@fontsource/inter/500.css';
	import '@fontsource/inter/600.css';
	import '@fontsource/inter/700.css';
	import { onMount } from 'svelte';
	import { getDb } from '$lib/db';
	import { applyTheme } from '$lib/theme.svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	onMount(async () => {
		applyTheme();
		await getDb();
	});
</script>

<div class="app">
	{@render children()}
</div>

<style>
	:global(:root) {
		--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
		--font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;

		/* Neutrals */
		--gray-50: #f8fafc;
		--gray-100: #f1f5f9;
		--gray-200: #e2e8f0;
		--gray-300: #cbd5e1;
		--gray-400: #94a3b8;
		--gray-500: #64748b;
		--gray-600: #475569;
		--gray-700: #334155;
		--gray-800: #1e293b;
		--gray-900: #0f172a;

		/* Primary — Indigo */
		--primary-50: #eef2ff;
		--primary-100: #e0e7ff;
		--primary-200: #c7d2fe;
		--primary-400: #818cf8;
		--primary-500: #6366f1;
		--primary-600: #4f46e5;
		--primary-700: #4338ca;

		/* Accent — Teal */
		--accent-50: #f0fdfa;
		--accent-100: #ccfbf1;
		--accent-400: #2dd4bf;
		--accent-500: #14b8a6;
		--accent-600: #0d9488;

		/* Rose for destructive */
		--rose-50: #fff1f2;
		--rose-400: #fb7185;
		--rose-500: #f43f5e;
		--rose-600: #e11d48;

		/* Amber for warnings/pins */
		--amber-50: #fffbeb;
		--amber-400: #fbbf24;
		--amber-500: #f59e0b;

		/* Spacing */
		--radius-sm: 6px;
		--radius-md: 8px;
		--radius-lg: 12px;
		--radius-full: 9999px;

		/* Shadows */
		--shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.06);
		--shadow-md: 0 4px 12px rgba(15, 23, 42, 0.08);
		--shadow-lg: 0 8px 24px rgba(15, 23, 42, 0.12);

		/* Transitions */
		--transition-fast: 120ms ease;
		--transition-normal: 200ms ease;

		/* Surfaces */
		--bg: #ffffff;
		--bg-secondary: var(--gray-50);
	}

	:global(:root.dark) {
		--gray-50: #0f172a;
		--gray-100: #1e293b;
		--gray-200: #334155;
		--gray-300: #475569;
		--gray-400: #64748b;
		--gray-500: #94a3b8;
		--gray-600: #cbd5e1;
		--gray-700: #e2e8f0;
		--gray-800: #f1f5f9;
		--gray-900: #f8fafc;

		--primary-50: #1e1b4b;
		--primary-100: #312e81;
		--primary-200: #3730a3;
		--primary-400: #818cf8;
		--primary-500: #6366f1;
		--primary-600: #818cf8;
		--primary-700: #a5b4fc;

		--accent-50: #042f2e;
		--accent-100: #134e4a;
		--accent-400: #2dd4bf;
		--accent-500: #14b8a6;
		--accent-600: #5eead4;

		--rose-50: #4c0519;
		--rose-400: #fb7185;
		--rose-500: #f43f5e;
		--rose-600: #fb7185;

		--amber-50: #451a03;
		--amber-400: #fbbf24;
		--amber-500: #f59e0b;

		--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
		--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
		--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);

		--bg: #0f172a;
		--bg-secondary: #1e293b;
	}

	:global(:root.dark body) {
		background: var(--bg);
		color: var(--gray-800);
	}

	:global(:root.dark ::selection) {
		background: var(--primary-200);
		color: var(--primary-700);
	}

	:global(:root.dark ::-webkit-scrollbar-thumb) {
		background: var(--gray-300);
	}

	:global(:root.dark ::-webkit-scrollbar-thumb:hover) {
		background: var(--gray-400);
	}

	:global(*) {
		margin: 0;
		padding: 0;
		box-sizing: border-box;
	}

	:global(html) {
		overflow: hidden;
		height: 100%;
	}

	:global(body) {
		font-family: var(--font-sans);
		font-size: 13.5px;
		line-height: 1.5;
		background: var(--bg);
		color: var(--gray-800);
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
		overflow: hidden;
		height: 100%;
		margin: 0;
	}

	:global(input, textarea, button, select) {
		font-family: inherit;
		font-size: inherit;
		line-height: inherit;
	}

	:global(button) {
		cursor: pointer;
		border: none;
		background: none;
	}

	:global(a) {
		color: var(--primary-600);
		text-decoration: none;
	}

	:global(a:hover) {
		text-decoration: underline;
	}

	:global(::selection) {
		background: var(--primary-100);
		color: var(--primary-700);
	}

	:global(::-webkit-scrollbar) {
		width: 6px;
		height: 6px;
	}

	:global(::-webkit-scrollbar-track) {
		background: transparent;
	}

	:global(::-webkit-scrollbar-thumb) {
		background: var(--gray-300);
		border-radius: var(--radius-full);
	}

	:global(::-webkit-scrollbar-thumb:hover) {
		background: var(--gray-400);
	}

	.app {
		height: 100%;
		display: flex;
		overflow: hidden;
	}
</style>
