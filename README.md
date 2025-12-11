<p align="center">
  <h1 align="center">🏥 Hoan My Portal</h1>
  <p align="center">
    <strong>Healthcare Management Dashboard</strong>
  </p>
  <p align="center">
    A modern Angular-based portal for hospital operations & analytics
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Angular-19-DD0031?logo=angular" alt="Angular 19">
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/ECharts-6.0-AA344D?logo=apacheecharts" alt="ECharts">
  <img src="https://img.shields.io/badge/Material-19-757575?logo=material-design" alt="Material">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License">
</p>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Screenshots](#-screenshots)
- [Tech Stack](#-tech-stack)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [Project Structure](#-project-structure)
- [Reports](#-reports)
- [AI Assistant](#-ai-assistant)
- [Keyboard Shortcuts](#-keyboard-shortcuts)
- [License](#-license)

---

## 🎯 Overview

**Hoan My Portal** is a comprehensive healthcare management dashboard built for **Hoan My Healthcare Group**. It provides real-time analytics, equipment management, and operational reports for hospital staff and administrators.

### Key Capabilities

- 📊 **Real-time Analytics** - Live dashboards with ECharts visualizations
- 🛏️ **Bed Management** - Track bed occupancy and usage across departments
- 🔬 **Clinical Services** - Monitor examination and diagnostic services
- 🏥 **Equipment Tracking** - Manage medical devices and maintenance schedules
- 🚨 **Emergency Metrics** - Track emergency admissions and response times
- 🤖 **AI Assistant** - Natural language navigation and help via LLM integration

---

## ✨ Features

### 🔐 Authentication & Security
- JWT-based authentication with automatic token refresh
- Role-based access control (RBAC) with permission guards
- Password change with security requirements
- Session management with auto-logout

### 📈 Data Visualization
- Interactive charts powered by **ECharts 6.0**
- Smart legend toggling (solo view mode)
- Responsive charts that adapt to screen size
- Export to Excel and PDF

### 🎨 User Experience
- **Dark/Light theme** with system preference detection
- **Keyboard shortcuts** for power users
- **AI Chat Assistant** for natural language navigation
- **Responsive design** - works on desktop, tablet, and mobile
- **Skeleton loading** for smooth perceived performance

### 📱 Progressive Features
- Offline-capable with service worker
- QR code generation for equipment tracking
- PDF report generation with pdfme

---

## 🛠 Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | Angular 19 (Standalone Components) |
| **UI Library** | Angular Material 19 |
| **Charts** | ECharts 6.0 |
| **State** | RxJS Signals |
| **Styling** | SCSS with CSS Variables |
| **PDF** | pdfme, pdf-lib |
| **Excel** | @e965/xlsx |
| **QR Codes** | angularx-qrcode |
| **Markdown** | marked + DOMPurify |
| **Testing** | Jasmine + Karma |
| **Linting** | ESLint with Angular rules |

---

## 📦 Installation

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 18.0.0 |
| npm | ≥ 8.0.0 |
| Angular CLI | ≥ 19.0.0 |

### Setup

```bash
# Clone the repository
git clone https://github.com/ghuyphan/hoan-my-portal.git
cd hoan-my-portal

# Install dependencies
npm install

# Start development server
npm start
```

The app will be available at `http://localhost:4200`

---

## ⚙️ Configuration

### Environment Variables

Configure your API endpoints in `src/environments/`:

```typescript
// environment.ts (development)
export const environment = {
  production: false,
  apiUrl: 'https://your-api-server.com/api',
  llmProxyUrl: 'http://localhost:3000'
};

// environment.prod.ts (production)
export const environment = {
  production: true,
  apiUrl: 'https://production-api.hoanmy.com/api',
  llmProxyUrl: 'https://llm-proxy.hoanmy.com'
};
```

---

## 🚀 Usage

### NPM Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start development server |
| `npm run build` | Build for production |
| `npm run build:prod:patch` | Build with patch version bump |
| `npm run build:prod:minor` | Build with minor version bump |
| `npm run build:prod:major` | Build with major version bump |
| `npm test` | Run unit tests |
| `npm run lint` | Run ESLint |

### Version Management

```bash
# Bump patch version (0.7.10 → 0.7.11)
npm run version:patch

# Bump minor version (0.7.10 → 0.8.0)
npm run version:minor

# Bump major version (0.7.10 → 1.0.0)
npm run version:major
```

---

## 🏗 Project Structure

```
src/app/
├── core/                     # Core functionality
│   ├── config/               # App configuration (keyboard shortcuts)
│   ├── guards/               # Route guards (auth, permission)
│   ├── interceptors/         # HTTP interceptors
│   ├── models/               # TypeScript interfaces
│   ├── services/             # Singleton services
│   │   ├── auth.service.ts           # Authentication & session
│   │   ├── device.service.ts         # Equipment API
│   │   ├── dropdown-data.service.ts  # Form dropdown data
│   │   ├── excel-export.service.ts   # Excel export
│   │   ├── keyboard-shortcut.service.ts # Keyboard shortcuts
│   │   ├── llm.service.ts            # AI chat integration
│   │   ├── modal.service.ts          # Modal management
│   │   ├── pdf.service.ts            # PDF generation
│   │   ├── report.service.ts         # Report API
│   │   ├── theme.service.ts          # Theme management
│   │   ├── toast.service.ts          # Toast notifications
│   │   └── version.service.ts        # App versioning
│   └── strategies/           # Custom strategies
│
├── features/                 # Feature modules
│   ├── auth/                 # Login, forgot password
│   ├── dashboard/            # Home dashboard
│   ├── equipment/            # Device management
│   │   ├── device-list/      # Equipment catalog
│   │   ├── device-detail/    # Equipment details
│   │   └── device-dashboard/ # Equipment analytics
│   ├── examination-overview/ # Examination reports
│   ├── reports/              # All other report modules
│   └── settings/             # User settings
│
├── layouts/                  # Page layouts
│   ├── auth-layout/          # Login page layout
│   └── main-layout/          # Dashboard layout
│
└── shared/                   # Shared components & utilities
    ├── animations/           # Reusable animations
    ├── components/           # Reusable UI components
    │   ├── action-footer/    # Modal action buttons
    │   ├── ai-chat/          # AI assistant widget
    │   ├── chart-card/       # Chart container
    │   ├── confirmation-modal/ # Confirm dialogs
    │   ├── date-filter/      # Date range picker
    │   ├── dynamic-form/     # Form generator
    │   ├── header/           # App header
    │   ├── modal/            # Base modal component
    │   ├── reusable-table/   # Data table
    │   ├── sidebar/          # Navigation sidebar
    │   ├── table-card/       # Table container
    │   ├── toast/            # Toast notifications
    │   └── widget-card/      # Dashboard widgets
    ├── directives/           # Custom directives
    │   ├── flyout.directive.ts    # Flyout menus
    │   ├── has-permission.directive.ts # Permission check
    │   └── tooltip.directive.ts   # Custom tooltips
    ├── models/               # Shared interfaces
    ├── pipes/                # Custom pipes
    └── utils/                # Utility functions
```

---

## 📊 Reports

The portal includes comprehensive healthcare reports:

### Equipment Management
| Report | Description |
|--------|-------------|
| Device Catalog | Browse and search all medical equipment |
| Device Dashboard | Equipment analytics and maintenance tracking |

### Clinical Reports
| Report | Description |
|--------|-------------|
| Bed Usage | Hospital bed occupancy rates |
| Examination Overview | Patient visit statistics |
| Detailed Examination | Granular examination data |
| ICD Frequency | Disease pattern analysis (ICD-10) |

### Diagnostic Services (CLS)
| Report | Description |
|--------|-------------|
| CLS Level 3 | Floor 3 examination statistics |
| CLS Level 6 | Floor 6 examination statistics |
| Specialty CLS | Breakdown by medical specialty |

### Emergency & Surgery
| Report | Description |
|--------|-------------|
| Emergency Ratio | Emergency visit statistics |
| Emergency Admissions | ER to admission tracking |
| Surgery Statistics | Surgical procedure tracking |

### Administrative
| Report | Description |
|--------|-------------|
| Missing Medical Records | Outpatient records not created |

---

## 🤖 AI Assistant

The portal includes an AI-powered assistant that can:

- **Navigate** - "Mở trang cài đặt" → Opens settings
- **Switch themes** - "Chuyển sang chế độ tối" → Enables dark mode
- **Answer questions** - Context-aware help about the dashboard
- **Multi-language** - Supports Vietnamese and English

### Activation
- Click the chat icon in the bottom-right corner
- Or press `Alt + A` to open the AI chat

The AI assistant connects to the [LLM Proxy Server](https://github.com/ghuyphan/llmproxy) for processing.

---

## ⌨️ Keyboard Shortcuts

The portal supports keyboard shortcuts for power users (defined in `src/app/core/config/keyboard-shortcuts.config.ts`):

### Global
| Shortcut | Action |
|----------|--------|
| `Ctrl + /` | Open AI Chat |
| `Ctrl + .` | Toggle Sidebar |
| `Ctrl + K` | Focus Search |
| `Alt + S` | Go to Settings |
| `Ctrl + Alt + L` | Logout |
| `Escape` | Close Modal/Chat |

### Device List
| Shortcut | Action |
|----------|--------|
| `Alt + C` | Create New Device |
| `Alt + E` | Edit Selected |
| `Alt + V` | View Details |
| `Delete` | Delete Selected |

### Date Filters
| Shortcut | Action |
|----------|--------|
| `Alt + F` | Open Date Picker |
| `Alt + Enter` | Apply Filter |
| `Alt + 1` | Today |
| `Alt + 2` | This Week |
| `Alt + 3` | This Month |
| `Alt + 4` | This Quarter |
| `Alt + 5` | This Year |

### Action Footer (Modals)
| Shortcut | Action |
|----------|--------|
| `Ctrl + Enter` | Primary Action (Save/Submit) |
| `Ctrl + S` | Save |

View all shortcuts in **Settings > Keyboard Shortcuts**.

---

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author

**Phan Gia Huy**  
Hoan My IT Department

---

<p align="center">
  Made with ❤️ for Hoan My Healthcare Group
</p>