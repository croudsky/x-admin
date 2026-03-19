import { DashboardClient } from "./components/DashboardClient";

export default function HomePage() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
  return <DashboardClient apiBaseUrl={apiBaseUrl} />;
}
