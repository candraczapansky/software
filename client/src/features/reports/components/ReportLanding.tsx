import { ReportCategoryCard } from "@/components/reports/ReportCategoryCard";
import { reportCategories } from "../utils/report-helpers";

interface ReportLandingProps {
  onSelectReport: (reportId: string) => void;
}

export const ReportLanding = ({ onSelectReport }: ReportLandingProps) => {
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {reportCategories.map((category) => (
          <ReportCategoryCard
            key={category.id}
            {...category}
            onClick={onSelectReport}
          />
        ))}
      </div>
    </div>
  );
};
