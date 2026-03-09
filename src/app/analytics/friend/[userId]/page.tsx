import { FriendAnalyticsView } from "@/components/analytics/FriendAnalyticsView";

export default async function FriendAnalyticsPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return <FriendAnalyticsView userId={userId} />;
}

