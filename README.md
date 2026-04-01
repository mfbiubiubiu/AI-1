# To Do App

A simple to do application built with Next.js (App Router), TypeScript, and Ant Design, with Clerk authentication.

## Features

- Modern layout with sidebar navigation
- Add new tasks
- Mark tasks as completed
- Delete tasks
- User authentication with Clerk (Email and Google login)
- Responsive design with Ant Design

## Layout

- **Sidebar**: Dark navigation bar with app title "TO-DO-LIST" and menu item "我的任务"
- **Header**: White top bar with user avatar (Clerk UserButton) on the right
- **Content**: Light gray background area containing the task list

## Authentication Setup

1. Sign up for a Clerk account at https://clerk.com
2. Create a new application in the Clerk dashboard
3. Copy the publishable key and secret key
4. Update `.env.local` with your keys:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_publishable_key_here
   CLERK_SECRET_KEY=your_secret_key_here
   ```
5. In Clerk dashboard, enable Google OAuth:
   - Go to Authentication > Social Connections
   - Enable Google and configure OAuth credentials

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables (see Authentication Setup above)

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Build

To build the app for production:

```bash
npm run build
npm start
```

## Technologies Used

- Next.js 15 (App Router)
- TypeScript
- Ant Design 5
- Clerk (Authentication)
- React 18