import type { ContainerRef } from "@/types/domain";

export function containerKey(container: ContainerRef): string {
  return `${container.containerType}:${container.containerId}`;
}

export function isSameContainer(a: ContainerRef, b: ContainerRef): boolean {
  return a.containerType === b.containerType && a.containerId === b.containerId;
}
