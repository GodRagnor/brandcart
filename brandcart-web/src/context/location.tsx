"use client";

import { createContext, useContext, useEffect, useState } from "react";

type LocationContextType = {
  pincode: string | null;
  setPincode: (pin: string) => void;
};

const LocationContext = createContext<LocationContextType | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [pincode, setPincodeState] = useState<string | null>(null);

  useEffect(() => {
    const saved = document.cookie
      .split("; ")
      .find((row) => row.startsWith("pincode="))
      ?.split("=")[1];

    if (saved) setPincodeState(saved);
  }, []);

  const setPincode = (pin: string) => {
    document.cookie = `pincode=${pin}; path=/; max-age=${60 * 60 * 24 * 30}`;
    setPincodeState(pin);
  };

  return (
    <LocationContext.Provider value={{ pincode, setPincode }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used inside LocationProvider");
  return ctx;
}
