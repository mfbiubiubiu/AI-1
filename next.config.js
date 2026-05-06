/** @type {import('next').NextConfig} */
const nextConfig = {
	experimental: {
		serverActions: {
			allowedOrigins: [
				'localhost:3000',
				'*.app.github.dev',
				'*.github.dev',
			],
		},
	},
};

module.exports = nextConfig