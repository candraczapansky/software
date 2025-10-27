import { lazy, Suspense } from 'react';
import type { ComponentType } from 'react';

// Lazy load all Recharts components
const BarChart = lazy(() => import('recharts').then(module => ({ default: module.BarChart })));
const Bar = lazy(() => import('recharts').then(module => ({ default: module.Bar })));
const XAxis = lazy(() => import('recharts').then(module => ({ default: module.XAxis })));
const YAxis = lazy(() => import('recharts').then(module => ({ default: module.YAxis })));
const CartesianGrid = lazy(() => import('recharts').then(module => ({ default: module.CartesianGrid })));
const Tooltip = lazy(() => import('recharts').then(module => ({ default: module.Tooltip })));
const Legend = lazy(() => import('recharts').then(module => ({ default: module.Legend })));
const ResponsiveContainer = lazy(() => import('recharts').then(module => ({ default: module.ResponsiveContainer })));
const LineChart = lazy(() => import('recharts').then(module => ({ default: module.LineChart })));
const Line = lazy(() => import('recharts').then(module => ({ default: module.Line })));
const PieChart = lazy(() => import('recharts').then(module => ({ default: module.PieChart as ComponentType<any> })));
const Pie = lazy(() => import('recharts').then(module => ({ default: module.Pie })));
const Cell = lazy(() => import('recharts').then(module => ({ default: module.Cell })));

// Loading component for charts
const ChartLoading = () => (
  <div className="flex items-center justify-center h-[300px]">
    <div className="text-center">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
      <p className="text-sm text-gray-500">Loading chart...</p>
    </div>
  </div>
);

// Export wrapped components that include Suspense
export const LazyBarChart = (props: any) => (
  <Suspense fallback={<ChartLoading />}>
    <BarChart {...props} />
  </Suspense>
);

export const LazyBar = (props: any) => (
  <Suspense fallback={null}>
    <Bar {...props} />
  </Suspense>
);

export const LazyXAxis = (props: any) => (
  <Suspense fallback={null}>
    <XAxis {...props} />
  </Suspense>
);

export const LazyYAxis = (props: any) => (
  <Suspense fallback={null}>
    <YAxis {...props} />
  </Suspense>
);

export const LazyCartesianGrid = (props: any) => (
  <Suspense fallback={null}>
    <CartesianGrid {...props} />
  </Suspense>
);

export const LazyTooltip = (props: any) => (
  <Suspense fallback={null}>
    <Tooltip {...props} />
  </Suspense>
);

export const LazyLegend = (props: any) => (
  <Suspense fallback={null}>
    <Legend {...props} />
  </Suspense>
);

export const LazyResponsiveContainer = (props: any) => (
  <Suspense fallback={<ChartLoading />}>
    <ResponsiveContainer {...props} />
  </Suspense>
);

export const LazyLineChart = (props: any) => (
  <Suspense fallback={<ChartLoading />}>
    <LineChart {...props} />
  </Suspense>
);

export const LazyLine = (props: any) => (
  <Suspense fallback={null}>
    <Line {...props} />
  </Suspense>
);

export const LazyPieChart = (props: any) => (
  <Suspense fallback={<ChartLoading />}>
    <PieChart {...props} />
  </Suspense>
);

export const LazyPie = (props: any) => (
  <Suspense fallback={null}>
    <Pie {...props} />
  </Suspense>
);

export const LazyCell = (props: any) => (
  <Suspense fallback={null}>
    <Cell {...props} />
  </Suspense>
);
