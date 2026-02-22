"use client";

import dynamic from "next/dynamic";

const HomeHeader = dynamic(
  () => import("./HomeHeader"),
  { ssr: false }
);

export default function HomeHeaderClient() {
  return <HomeHeader />;
}
