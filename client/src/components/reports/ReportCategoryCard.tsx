import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface ReportCategoryCardProps {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  onClick: (id: string) => void;
}

export const ReportCategoryCard = ({
  id,
  title,
  description,
  icon: Icon,
  color,
  bgColor,
  onClick,
}: ReportCategoryCardProps) => {
  return (
    <Card 
      className="hover:shadow-lg transition-shadow duration-200 cursor-pointer group min-h-[120px] md:min-h-[160px]"
      onClick={() => onClick(id)}
    >
      <CardContent className="p-4 md:p-6">
        <div className="flex items-start justify-between h-full">
          <div className="flex-1">
            <div className={`inline-flex p-2 md:p-3 rounded-lg ${bgColor} mb-3 md:mb-4`}>
              <Icon className={`h-5 w-5 md:h-6 md:w-6 ${color}`} />
            </div>
            <h3 className="text-base md:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1 md:mb-2 leading-tight">
              {title}
            </h3>
            <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mb-3 md:mb-4 line-clamp-2">
              {description}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
