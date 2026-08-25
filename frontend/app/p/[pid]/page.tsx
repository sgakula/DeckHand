import { redirect } from "next/navigation";

export default async function PresentationIndex({
  params,
}: {
  params: Promise<{ pid: string }>;
}) {
  const { pid } = await params;
  redirect(`/p/${pid}/brief`);
}
