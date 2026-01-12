# Organia — Case & Workflow Management SaaS

Organia is a modern, Tunisian-born SaaS platform designed to help professionals manage cases, clients, tasks, documents, financial tracking, and daily operations — all in one clean and intuitive dashboard.  
Built with a scalable architecture, Organia can adapt beyond legal workflows to any business needing structured management.

---

## 🚀 Features

### 🌙 Full Dark Mode  
Global dark/light theme system powered by Tailwind + Context Providers.

### 📁 Modular Sidebar Navigation  
Fully collapsible, responsive sidebar with FontAwesome icons:
- Dashboard  
- Clients  
- Dossiers  
- Tasks  
- Cases  
- Sessions  
- Courses  
- Officers  
- Accounting  
- ChatBot  

### 📄 Individual Screens  
Each module has its own screen located in:  
`src/Screens/...`

### 📊 Reusable Table Components  
Reusable table system under:  
`src/components/table/`

Includes:
- Table  
- TableHeader  
- TableRow  
- TableCell  
- TableBody  
- Pagination  
- TableActions  
- EmptyState  

This ensures consistent UI/UX across all screens.

### 🧩 Shared UI Components  
Using ShadCN UI + custom extensions:
- Cards  
- Inputs  
- Buttons  
- Dialogs  
- Dropdowns  
- Sheets  

### 🔔 Notification System  
Minimal and extendable notification dropdown integrated in the header.

---

## 🏛️ Project Structure

```
src/
 ├─ Screens/           → All page screens  
 ├─ components/
 │   ├─ layout/        → Page header + layout wrappers  
 │   ├─ table/         → Reusable table components  
 │   ├─ ui/            → ShadCN-based UI components  
 │   ├─ Sidebar.jsx  
 │   ├─ Header.jsx  
 ├─ contexts/
 │   ├─ ThemeProvider.jsx  
 │   ├─ SidebarContext.jsx  
 ├─ utils/
 │   └─ mockData.js  
 ├─ App.tsx  
 ├─ main.tsx  
 └─ index.css          → Tailwind setup + theme variables  
```

---

## 🛠️ Tech Stack

- **React + TypeScript**  
- **Vite**  
- **TailwindCSS**  
- **ShadCN UI**  
- **PostCSS**  
- **React Router**  
- **FontAwesome**  

---

## 🌐 Setup & Installation

### 1. Clone the repository
```bash
git clone https://github.com/mootez/lawyer-app.git
cd lawyer-app
```

### 2. Install dependencies
```bash
npm install
```

### 3. Run development server
```bash
npm run dev
```

---

## 📦 Build for Production

```bash
npm run build
```

---

## 🎯 Vision

Organia aims to become the go-to management workspace for professionals in Tunisia and across the region.  
A unified dashboard that handles:
- Client records  
- Document & dossier management  
- Legal cases & sessions  
- Tasks & workflows  
- Accountability & financial tracking  

Fast, organized, and beautifully designed.

---

## 🤝 Contributing

Contributions are welcome!  
Organia’s modular architecture makes it easy to add:
- New screens  
- New components  
- Additional business modules  

Open a pull request with your contribution.

---

## 📄 License

MIT License
