import { Trip, UtilityBill, UserProfile, CustomVehicle } from "./types";

const USERS_KEY = 'ecopulse_users_db';
const DATA_PREFIX = 'ecopulse_data_v3_';

export const storage = {
  getUsers: () => JSON.parse(localStorage.getItem(USERS_KEY) || '{}'),
  
  saveUser: (username: string, password: string) => {
    const users = storage.getUsers();
    users[username.toLowerCase()] = { 
      username, 
      password, 
      createdAt: new Date().toISOString() 
    };
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  },

  getUserData: (username: string): { 
    trips: Trip[], 
    bills: UtilityBill[], 
    user: UserProfile 
  } | null => {
    const data = localStorage.getItem(`${DATA_PREFIX}${username.toLowerCase()}`);
    return data ? JSON.parse(data) : null;
  },

  saveUserData: (
    username: string, 
    data: { 
      trips: Trip[], 
      bills: UtilityBill[], 
      user: UserProfile 
    }
  ) => {
    localStorage.setItem(
      `${DATA_PREFIX}${username.toLowerCase()}`, 
      JSON.stringify(data)
    );
  },

  getCustomVehicles: (username: string): CustomVehicle[] => {
    const userData = storage.getUserData(username);
    return userData?.user?.customVehicles || [];
  },

  saveCustomVehicle: (username: string, vehicle: CustomVehicle) => {
    const userData = storage.getUserData(username);
    if (!userData) return;
    
    if (!userData.user.customVehicles) {
      userData.user.customVehicles = [];
    }
    
    userData.user.customVehicles.push({
      ...vehicle,
      addedDate: new Date().toISOString()
    });
    
    storage.saveUserData(username, userData);
  },

  deleteCustomVehicle: (username: string, vehicleName: string) => {
    const userData = storage.getUserData(username);
    if (!userData) return;
    
    userData.user.customVehicles = userData.user.customVehicles?.filter(
      v => v.name !== vehicleName
    ) || [];
    
    storage.saveUserData(username, userData);
  },

  migrateUserData: (username: string) => {
    const oldKey = `ecopulse_data_v2_${username.toLowerCase()}`;
    const oldData = localStorage.getItem(oldKey);
    
    if (oldData) {
      const parsed = JSON.parse(oldData);
      if (!parsed.user.customVehicles) {
        parsed.user.customVehicles = [];
      }
      storage.saveUserData(username, parsed);
    }
  }
};
