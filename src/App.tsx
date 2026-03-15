import { useMemo } from 'react';
import { type GridColDef } from '@mui/x-data-grid-premium';
import testJsonRaw from 'fast-json-stable-stringify/benchmark/test.json?raw';
import { TiwariGrid } from './lib';

type SourceRecord = {
  index: number;
  name: string;
  age: number;
  balance: string;
  company: string;
  favoriteFruit: string;
  isActive: boolean;
};

type DemoSecurityRow = {
  id: string;
  securityName: string;
  assetClass: string;
  quantity: number;
  price: number;
  notes: string;
};

function parseBalance(value: string): number {
  const numeric = Number(value.replace(/[$,]/g, ''));
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

function toAssetClass(favoriteFruit: string, index: number): string {
  const normalized = favoriteFruit.toLowerCase();

  if (normalized === 'banana') {
    return 'Equity';
  }

  if (normalized === 'strawberry') {
    return 'Mutual Funds';
  }

  if (normalized === 'apple') {
    return 'ETF';
  }

  return index % 2 === 0 ? 'Bonds' : 'ETF';
}

function App() {
  const rows = useMemo(() => {
    const source = JSON.parse(testJsonRaw) as SourceRecord[];

    return source.map<DemoSecurityRow>((item) => ({
      id: `SEC${String(item.index + 101).padStart(3, '0')}`,
      securityName: item.name,
      assetClass: toAssetClass(item.favoriteFruit, item.index),
      quantity: item.age * (item.isActive ? 3 : 2),
      price: parseBalance(item.balance),
      notes: `Mapped from ${item.company}`,
    }));
  }, []);

  const columns = useMemo<GridColDef<DemoSecurityRow>[]>(
    () => [
      {
        field: 'securityName',
        headerName: 'Security Name',
        flex: 1.2,
        minWidth: 220,
        editable: true,
        align: 'left',
        headerAlign: 'left',
      },
      {
        field: 'assetClass',
        headerName: 'Asset Class',
        flex: 0.8,
        minWidth: 160,
        editable: true,
        type: 'singleSelect',
        valueOptions: ['Equity', 'Mutual Funds', 'ETF', 'Bonds'],
        align: 'left',
        headerAlign: 'left',
      },
      {
        field: 'quantity',
        headerName: 'Quantity',
        type: 'number',
        minWidth: 130,
        editable: true,
        align: 'center',
        headerAlign: 'center',
      },
      {
        field: 'price',
        headerName: 'Price',
        type: 'number',
        minWidth: 130,
        editable: true,
        align: 'center',
        headerAlign: 'center',
      },
      {
        field: 'notes',
        headerName: 'Notes',
        flex: 1.4,
        minWidth: 220,
        editable: true,
        align: 'left',
        headerAlign: 'left',
      },
    ],
    [],
  );

  return (
    <TiwariGrid
      gridId="securitiesGrid"
      rows={rows}
      columns={columns}
      title="TiwariGrid Demo"
      subtitle="Reusable npm dependency version with persistence, grouping, pinning, export, search, and undo/redo."
    />
  );
}

export default App;
