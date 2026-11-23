import { defineConfig, devices } from '@playwright/test';

// Mobile emulation only (phones + tablets, touch).
export default defineConfig({
	webServer: { command: 'pnpm build && pnpm preview --port 4174 --strictPort', port: 4174 },
	workers: 2,
	testDir: 'tests',
	testMatch: '**/*.e2e.ts',
	use: {
		baseURL: 'http://localhost:4174',
		screenshot: 'only-on-failure',
		trace: 'off'
	},
	projects: [
		{ name: 'iphone', use: { ...devices['iPhone 13'] } },
		{ name: 'pixel', use: { ...devices['Pixel 7'] } }
	]
});
