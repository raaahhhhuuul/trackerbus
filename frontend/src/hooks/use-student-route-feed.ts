import { useEffect, useState } from "react";
import {
  getCachedStudentRoute,
  subscribeToStudentRoute,
  type StudentRouteRecord,
} from "@/lib/student-route";

export function useStudentRouteFeed() {
  const [route, setRoute] = useState<StudentRouteRecord | null>(() => getCachedStudentRoute());

  useEffect(() => {
    const unsubscribe = subscribeToStudentRoute((next) => {
      setRoute(next);
    });

    return unsubscribe;
  }, []);

  return { route };
}
