# tiwari-grid

`tiwari-grid` is a reusable npm dependency that provides `TiwariGrid`, a sleek, production-ready wrapper around MUI Data Grid Premium with state persistence and advanced UX features.

## Features

- Double-click cell editing
- Drag-and-drop column reordering
- Sorting and filtering
- Row grouping
- Pin/Unpin columns
- Hide/Unhide columns
- Export data
- Search (quick filter)
- Undo/Redo
- Column width resize
- Automatic localStorage persistence + restore on refresh
- Sleek responsive design

## Install

```bash
npm install tiwari-grid
```

Peer dependencies required:

- `react`
- `react-dom`
- `@mui/material`
- `@mui/x-data-grid-premium`
- `@emotion/react`
- `@emotion/styled`

## Usage

```tsx
import { TiwariGrid, type TiwariGridProps } from 'tiwari-grid';
import type { GridColDef } from '@mui/x-data-grid-premium';

type Row = {
  id: string;
  name: string;
  quantity: number;
  price: number;
};

const rows: Row[] = [
  { id: '1', name: 'Apple', quantity: 10, price: 120 },
  { id: '2', name: 'Tesla', quantity: 4, price: 180 },
];

const columns: GridColDef<Row>[] = [
  { field: 'name', headerName: 'Name', flex: 1, editable: true },
  {
    field: 'quantity',
    headerName: 'Quantity',
    type: 'number',
    width: 130,
    editable: true,
  },
  {
    field: 'price',
    headerName: 'Price',
    type: 'number',
    width: 130,
    editable: true,
  },
];

export default function Example() {
  return (
    <TiwariGrid<Row>
      gridId="portfolio-grid"
      rows={rows}
      columns={columns}
      title="Portfolio"
      subtitle="Reusable TiwariGrid"
    />
  );
}
```

## Build

```bash
npm run build
```

Build outputs:

- `dist/lib/tiwari-grid.mjs`
- `dist/lib/tiwari-grid.cjs`
- `dist/types/index.d.ts`

## Notes

- This package is based on **MUI Data Grid Premium**. Ensure your project complies with MUI X Premium licensing requirements.
- Grid state is persisted under `tiwari-grid-state:<gridId>` in localStorage.
