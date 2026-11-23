export type Role = "admin" | "teacher" | "student";

export type Permission = "issue" | "manage-directory" | "view-records" | "view-department" | "verify" | "present";

export interface Account {
  id: string;
  name: string;
  username: string;
  role: Role;
  address: string;
  detail: string;
  title?: string;
  departments?: string[];
  field?: string;
  createdAt: string;
}

export const ROLE_INFO: Record<Role, { label: string; shortLabel: string; blurb: string }> = {
  admin: {
    label: "Administrator",
    shortLabel: "Admin",
    blurb: "Issue batches, manage the directory, audit records"
  },
  teacher: {
    label: "Teacher",
    shortLabel: "Faculty",
    blurb: "Verify presentations, view the department roster"
  },
  student: {
    label: "Student",
    shortLabel: "Student",
    blurb: "Hold a DID, present your own credentials"
  }
};

export interface PermissionInfo {
  id: Permission;
  label: string;
  description: string;
  roles: Role[];
}

export const PERMISSIONS: PermissionInfo[] = [
  {
    id: "issue",
    label: "Issue degree batches",
    description: "Hash, sign and anchor a graduating cohort",
    roles: ["admin"]
  },
  {
    id: "manage-directory",
    label: "Manage the institution directory",
    description: "Enroll members and review every role on file",
    roles: ["admin"]
  },
  {
    id: "view-records",
    label: "View all institution records",
    description: "Every batch, holder and credential on file",
    roles: ["admin"]
  },
  {
    id: "view-department",
    label: "View department records",
    description: "Students enrolled in the teacher's own departments",
    roles: ["admin", "teacher"]
  },
  {
    id: "verify",
    label: "Verify presented credentials",
    description: "Run the seven-check pipeline against the registry",
    roles: ["admin", "teacher"]
  },
  {
    id: "present",
    label: "Present own credentials",
    description: "Share a credential together with its Merkle proof",
    roles: ["student"]
  }
];

export const DEPARTMENTS = [
  "Computer Science",
  "Data Science",
  "Electrical Engineering",
  "Information Systems",
  "Mechanical Engineering"
];

export const TEACHER_TITLES = ["Professor", "Associate Professor", "Assistant Professor", "Lecturer"];

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS.some((item) => item.id === permission && item.roles.includes(role));
}

export function permissionsFor(role: Role): PermissionInfo[] {
  return PERMISSIONS.filter((item) => item.roles.includes(role));
}
