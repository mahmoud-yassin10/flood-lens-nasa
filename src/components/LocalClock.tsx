import { useEffect, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

interface LocalClockProps {
  timezone: string;
  className?: string;
}

export function LocalClock({ timezone, className = "" }: LocalClockProps) {
  const [time, setTime] = useState(dayjs().tz(timezone));

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(dayjs().tz(timezone));
    }, 1000);

    return () => clearInterval(interval);
  }, [timezone]);

  return (
    <div className={`font-mono text-sm ${className}`}>
      {time.format("hh:mm:ss A")}
    </div>
  );
}

