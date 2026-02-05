import { User } from "@/types/user";

let mockUsers: User[] = [
  {
    id: "u1",
    name: "Alice Johnson (Superintendent)",
    email: "alice.j@crm.com",
    role: "SUPERINTENDENT",
    managerId: null,
    leadAssignmentEnabled: false,
  },
  {
    id: "u2",
    name: "Bob Smith (Manager)",
    email: "bob.s@crm.com",
    role: "MANAGER",
    managerId: "u1",
    leadAssignmentEnabled: false,
  },
  {
    id: "u3",
    name: "Charlie Brown (Broker)",
    email: "charlie.b@crm.com",
    role: "BROKER",
    managerId: "u2",
    leadAssignmentEnabled: true,
  },
];

export const getMockUsers = () => mockUsers;
export const getManagers = () => mockUsers.filter(u => u.role === 'MANAGER');
export const updateMockUsers = (user: User) => {
  const index = mockUsers.findIndex(u => u.id === user.id);
  if (index !== -1) mockUsers[index] = user;
  else mockUsers.push(user);
};