import { User } from "@/types/user";

let mockUsers: User[] = [];

export const getMockUsers = () => mockUsers;
export const getManagers = () => mockUsers.filter(u => u.role === 'MANAGER');
export const updateMockUsers = (user: User) => {
  const index = mockUsers.findIndex(u => u.id === user.id);
  if (index !== -1) mockUsers[index] = user;
  else mockUsers.push(user);
};