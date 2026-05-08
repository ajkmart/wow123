import { withErrorBoundary } from "@/utils/withErrorBoundary";
import { withServiceGuard } from "@/components/ServiceGuard";

export default withErrorBoundary(
  withServiceGuard("pharmacy", () => import("./_Screen")),
);
