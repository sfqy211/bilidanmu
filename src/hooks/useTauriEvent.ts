import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export function useTauriEvent<T>(eventName: string, handler: (payload: T) => void) {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let disposed = false;

    const setup = async () => {
      const fn = await listen<T>(eventName, (event) => {
        handlerRef.current(event.payload);
      });

      if (disposed) {
        await fn();
        return;
      }

      unlisten = fn;
    };

    void setup();

    return () => {
      disposed = true;
      if (unlisten) {
        void unlisten();
      }
    };
  }, [eventName]);
}
