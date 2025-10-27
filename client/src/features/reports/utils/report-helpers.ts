import { LucideIcon, BarChart2, Users, Calendar, Scissors, DollarSign, Clock } from "lucide-react";

export interface ReportCategory {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

export const reportCategories: ReportCategory[] = [
  {
    id: "sales",
    title: "Sales Reports",
    description: "Revenue, transactions, and sales performance analytics",
    icon: BarChart2,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    id: "clients",
    title: "Client Reports", 
    description: "Client demographics, retention, and engagement metrics",
    icon: Users,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    id: "appointments",
    title: "Appointment Reports",
    description: "No-shows, cancellations, and appointment performance analytics",
    icon: Calendar,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    id: "services",
    title: "Service Reports",
    description: "Service popularity, pricing, and performance insights",
    icon: Scissors,
    color: "text-primary", 
    bgColor: "bg-primary/10",
  },
  {
    id: "staff",
    title: "Staff Reports",
    description: "Staff performance, productivity, and utilization metrics",
    icon: Users,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    id: "payroll",
    title: "Payroll Reports",
    description: "Staff earnings, commissions, and payroll summaries",
    icon: DollarSign,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    id: "timeclock",
    title: "Time Clock Reports",
    description: "Staff attendance, hours worked, and time tracking",
    icon: Clock,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
];

export const getReportTitle = (reportId: string) => {
  const report = reportCategories.find(r => r.id === reportId);
  return report?.title || "Report";
};

export const getReportDescription = (reportId: string) => {
  const report = reportCategories.find(r => r.id === reportId);
  return report?.description || "View detailed analytics and insights";
};
