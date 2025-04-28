# Node.js TypeScript Boilerplate

A minimal Node.js project setup with TypeScript and hot-reloading support.

## Features

- TypeScript support
- Hot reloading with ts-node-dev
- Automatic compilation on save

## Getting Started

### Installation

Install the dependencies:

```bash
npm install
```

### Development

To start the development server with hot reloading:

```bash
npm run dev
```

This will start the application and automatically restart it whenever you make changes to the source files.

### Building for Production

To compile TypeScript to JavaScript:

```bash
npm run build
```

### Running in Production

To run the compiled JavaScript:

```bash
npm start
```

## Project Structure

- `src/` - TypeScript source files
- `dist/` - Compiled JavaScript files (generated)
- `package.json` - Project configuration
- `tsconfig.json` - TypeScript configuration 