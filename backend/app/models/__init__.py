"""ORM models — import side effects register tables on Base.metadata."""

from app.models.action import Action
from app.models.action_link import ActionLink
from app.models.alert import Alert
from app.models.alert_rule import AlertRule
from app.models.audit_log import AuditLog
from app.models.column_mapping_template import ColumnMappingTemplate
from app.models.custom_field_definition import CustomFieldDefinition
from app.models.customer import Customer
from app.models.customer_complaint import CustomerComplaint
from app.models.column_mapping import ColumnMapping
from app.models.data_source import DataSource
from app.models.department import Department
from app.models.field_configuration import FieldConfiguration
from app.models.google_form_config import GoogleFormConfig
from app.models.google_sheet_config import GoogleSheetConfig
from app.models.dispatch_record import DispatchRecord
from app.models.downtime_event import DowntimeEvent
from app.models.downtime_reason import DowntimeReason
from app.models.grn_record import GrnRecord
from app.models.import_job import ImportJob
from app.models.import_job_row import ImportJobRow
from app.models.inventory_snapshot import InventorySnapshot
from app.models.kpi_definition import KpiDefinition
from app.models.kpi_result import KpiResult
from app.models.line import Line
from app.models.machine import Machine
from app.models.machine_part_standard import MachinePartStandard
from app.models.machine_status import MachineStatus
from app.models.machine_type import MachineType
from app.models.maintenance_ticket import MaintenanceTicket
from app.models.material import Material
from app.models.oee_snapshot import OeeSnapshot
from app.models.operator import Operator
from app.models.part import Part
from app.models.plant import Plant
from app.models.pm_completion import PmCompletion
from app.models.pm_schedule import PmSchedule
from app.models.production_plan import ProductionPlan
from app.models.production_record import ProductionRecord
from app.models.production_record_metrics import ProductionRecordMetrics
from app.models.quality_inspection import QualityInspection
from app.models.rejection_event import RejectionEvent
from app.models.rejection_reason import RejectionReason
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.shift import Shift
from app.models.shift_calendar import ShiftCalendar
from app.models.sync_log import SyncLog
from app.models.user import User
from app.models.user_role import UserRole

__all__ = [
    "Action",
    "ActionLink",
    "Alert",
    "AlertRule",
    "AuditLog",
    "ColumnMappingTemplate",
    "CustomFieldDefinition",
    "Customer",
    "CustomerComplaint",
    "ColumnMapping",
    "DataSource",
    "Department",
    "FieldConfiguration",
    "GoogleFormConfig",
    "GoogleSheetConfig",
    "DispatchRecord",
    "DowntimeEvent",
    "DowntimeReason",
    "GrnRecord",
    "ImportJob",
    "ImportJobRow",
    "InventorySnapshot",
    "KpiDefinition",
    "KpiResult",
    "Line",
    "Machine",
    "MachinePartStandard",
    "MachineStatus",
    "MachineType",
    "MaintenanceTicket",
    "Material",
    "OeeSnapshot",
    "Operator",
    "Part",
    "Plant",
    "PmCompletion",
    "PmSchedule",
    "ProductionPlan",
    "ProductionRecord",
    "ProductionRecordMetrics",
    "QualityInspection",
    "RejectionEvent",
    "RejectionReason",
    "Role",
    "RolePermission",
    "Shift",
    "ShiftCalendar",
    "SyncLog",
    "User",
    "UserRole",
]
