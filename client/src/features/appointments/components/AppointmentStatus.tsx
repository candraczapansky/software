import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, AlertCircle, Clock, Calendar } from "lucide-react";
import { getStatusColor, getStatusIcon } from "../utils/appointment-helpers";

interface AppointmentStatusProps {
  status: string;
  className?: string;
}

const icons = {
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Calendar,
};

export const AppointmentStatus = ({ status, className = "" }: AppointmentStatusProps) => {
  const statusColor = getStatusColor(status);
  const IconComponent = icons[getStatusIcon(status) as keyof typeof icons];

  return (
    <Badge variant="secondary" className={`${statusColor} ${className}`}>
      <IconComponent className="w-4 h-4 mr-1" />
      <span className="capitalize">{status}</span>
    </Badge>
  );
};
