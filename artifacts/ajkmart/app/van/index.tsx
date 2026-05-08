import { withServiceGuard } from "@/components/ServiceGuard";

export default withServiceGuard("van", () => import("./_Screen"));
