/**
 * Shared admin chrome primitives — single source for page headers,
 * read-only "Manage in Settings" shortcuts, stat cards, filter bars,
 * and other building blocks used across multiple routes.
 */
export { PageHeader } from "./PageHeader";
export type { PageHeaderProps, BreadcrumbCrumb } from "./PageHeader";
export { ManageInSettingsLink } from "./ManageInSettingsLink";
export type { ManageInSettingsLinkProps, ManageInSettingsTone } from "./ManageInSettingsLink";
export { StatCard, StatCardSkeleton } from "./StatCard";
export type { StatCardProps } from "./StatCard";
export { FilterBar } from "./FilterBar";
export type { FilterBarProps } from "./FilterBar";
export { ActionBar } from "./ActionBar";
export type { ActionBarProps } from "./ActionBar";

export { ConfirmDelete } from "./ConfirmDelete";
export type { ConfirmDeleteProps } from "./ConfirmDelete";
export { DataTable } from "./DataTable";
export type { DataTableProps, DataTableColumn } from "./DataTable";
export { ExportData } from "./ExportData";
export type { ExportDataProps } from "./ExportData";
export { BulkUpload } from "./BulkUpload";
export type { BulkUploadProps } from "./BulkUpload";
