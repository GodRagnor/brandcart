"use client";

import { LocationProvider } from "@/context/location";

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LocationProvider>{children}</LocationProvider>;
}
