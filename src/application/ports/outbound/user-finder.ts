export interface UserFinder {
  exists(userId: number): Promise<boolean>;
}
