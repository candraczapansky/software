import BookingWidget from "./booking-widget";

type BookingWidgetMobileProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: number;
  overlayColor?: string;
};

export default function BookingWidgetMobile({ open, onOpenChange, userId, overlayColor }: BookingWidgetMobileProps) {
  return (
    <BookingWidget
      open={open}
      onOpenChange={onOpenChange}
      overlayColor={overlayColor}
      variant="mobile"
    />
  );
}








