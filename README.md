# SPAG - Spending & Agenda Tracker

A full-stack web application to manage your tasks, reminders, notes, and track your spending in one place. Built with modern web technologies for a fast and responsive experience.

## Project Status

### ✅ Implemented Features

**Agenda & Task Management:**
- Create tasks, reminders, and notes with flexible scheduling
- Set target dates and times with timestamp picker
- Mark tasks as completed
- Pin important notes for quick access
- Recurring items support (daily, weekly, monthly)
- Sort by target date or creation date
- Notes grid layout (1, 2, or 3 columns)
- Edit and delete agenda items
- Real-time updates with tRPC

**Core Infrastructure:**
- User authentication with Better-auth
- PostgreSQL database with Drizzle ORM
- Type-safe API with tRPC
- Protected routes and user isolation
- Responsive design with Tailwind CSS

### 🚧 In Progress / Not Implemented

**Spending Tracker:**
- UI partially implemented
- Backend structure in place but incomplete
- Missing: transaction history, statistics, budgeting features, reporting

**Additional Features:**
- Notification/reminder system (schema ready, implementation pending)
- Advanced filtering and search
- Dashboard with analytics
- Export functionality

## Tech Stack

- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend:** Node.js, tRPC, Drizzle ORM
- **Database:** PostgreSQL
- **Authentication:** Better-auth
- **Build Tools:** Biome (linting/formatting)
- **UI Components:** Radix UI, Lucide icons

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 12+
- Docker (optional, for database)

### Installation

1. Clone the repository
```bash
git clone git@github.com:embeddedskills/spag.git
cd spag
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
```bash
cp .env.example .env.local
```
Fill in your database URL and other required variables.

4. Start the database (if using Docker)
```bash
docker-compose up -d
./start-database.sh
```

5. Push database schema
```bash
npm run db:push
```

6. Run development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run db:push` - Sync database schema
- `npm run db:generate` - Generate Drizzle migrations
- `npm run db:migrate` - Run migrations
- `npm run db:studio` - Open Drizzle Studio
- `npm run check` - Run Biome linter
- `npm run typecheck` - TypeScript type checking

## Project Structure

```
src/
├── app/                 # Next.js app router
│   ├── (dashboard)/     # Protected dashboard routes
│   │   ├── agenda/      # Task management page
│   │   └── spending/    # Expense tracker page
│   ├── api/             # API routes
│   ├── login/           # Authentication pages
│   └── signup/
├── components/          # React components
│   ├── auth/           # Authentication components
│   └── ui/             # Reusable UI components
├── server/             # Backend logic
│   ├── api/            # tRPC router and procedures
│   ├── better-auth/    # Auth configuration
│   └── db/             # Database schema and setup
└── styles/            # Global styles
```

## Future Roadmap

1. Complete spending tracker functionality
2. Add budget management and analytics
3. Implement notification system
4. Add data export (CSV, PDF)
5. Mobile app (React Native)
6. Calendar view for agenda
7. Recurring item completion automation
8. Sharing and collaboration features

## Contributing

Feel free to open issues and pull requests for bug fixes and features.

## License

MIT
