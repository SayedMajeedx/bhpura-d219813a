/** A readable reason for the database's booking refusals. */
export function bookingErrorMessage(message: string, isAr: boolean): string {
  const known: Array<[RegExp, string, string]> = [
    [/BOOKING_DAY_FULL/, "هذا اليوم محجوز بالكامل.", "That day is fully booked."],
    [
      /SERVICE_NEEDS_BOOKING/,
      "الخدمات تُحجز بموعد. احذف الخدمة من السلة واحجزها من صفحتها.",
      "Services are booked for a date. Remove the service from your cart and book it from its page.",
    ],
    [
      /BOOKING_DAY_(PAST|BEYOND)/,
      "هذا التاريخ غير متاح للحجز، اختر يوماً آخر.",
      "That date can't be booked; please choose another.",
    ],
    [/BOOKING_NAME_REQUIRED/, "أدخل اسمك.", "Please enter your name."],
    [/BOOKING_PHONE_REQUIRED/, "أدخل رقم هاتف صحيح.", "Please enter a valid phone number."],
    [
      /BOOKING_RATE_LIMITED/,
      "أرسلت عدة طلبات للتو. حاول بعد قليل أو تواصل معنا.",
      "You've sent several requests just now. Try again shortly or contact us.",
    ],
    [
      /BOOKING_HOLD_EXPIRED/,
      "انتهت مدة حجز الموعد وأُخذ اليوم. اختر يوماً آخر.",
      "Your hold ran out and the day was taken. Please choose another day.",
    ],
    [
      /BOOKING_HOLD_NOT_FOUND|BOOKING_ALREADY_ORDERED/,
      "لم نعد نجد هذا الحجز. ابدأ الحجز من جديد.",
      "We can't find this booking any more. Please book again.",
    ],
    [
      /BOOKING_ITEMS_MISMATCH/,
      "خدمات الحجز لم تعد في السلة. ابدأ الحجز من جديد.",
      "The booked services are no longer in your cart. Please book again.",
    ],
    [
      /BOOKING_PRODUCT_NOT_FOUND/,
      "إحدى الخدمات لم تعد متاحة.",
      "One of the services is no longer available.",
    ],
    [/BOOKING_DAY_BLOCKED/, "هذا اليوم مغلق للحجز.", "That day is blocked."],
    [
      /BOOKING_DAY_CLOSED/,
      "المتجر لا يستقبل حجوزات في هذا اليوم.",
      "The store is closed that day.",
    ],
    [
      /BOOKING_TIME_OUTSIDE_HOURS/,
      "وقت البداية خارج أوقات الحجز.",
      "That start time is outside booking hours.",
    ],
    [/BOOKING_DURATION_INVALID/, "المدة غير متاحة.", "That duration is not offered."],
    [/BOOKING_ITEMS_REQUIRED/, "اختر خدمة واحدة على الأقل.", "Choose at least one service."],
    [
      /BOOKINGS_DISABLED/,
      "الحجوزات غير مفعلة لهذا المتجر.",
      "Bookings are not set up for this store.",
    ],
    [/BOOKING_FORBIDDEN/, "لا تملك صلاحية إدارة الحجوزات.", "You can't manage bookings."],
    [
      /BOOKING_TRANSITION_INVALID/,
      "لا يمكن نقل الحجز إلى هذه الحالة.",
      "A booking can't move to that status.",
    ],
  ];
  const match = known.find(([pattern]) => pattern.test(message));
  if (match) return isAr ? match[1] : match[2];
  return isAr ? "تعذّر حفظ الحجز." : "Could not save the booking.";
}
