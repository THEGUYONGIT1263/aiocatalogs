import { UserConfig, CatalogManifest } from '../../types/index';
import { logger } from '../utils/logger';

/**
 * Abstract configuration manager that defines the common interface
 * to be implemented by both Cloudflare and Node.js versions
 */
export abstract class BaseConfigManager {
  protected cache: Map<string, UserConfig>;

  constructor() {
    this.cache = new Map();
  }

  /**
   * Generate a new unique user ID
   */
  abstract generateUserId(): Promise<string> | string;

  /**
   * Load the configuration for a user
   */
  abstract loadConfig(userId: string): Promise<UserConfig> | UserConfig;

  /**
   * Save the configuration for a user
   */
  abstract saveConfig(userId: string, config?: UserConfig): Promise<boolean> | boolean;

  /**
   * Get the current configuration for a user
   */
  async getConfig(userId: string): Promise<UserConfig> {
    const config = await this.loadConfig(userId);

    // Initialize catalogOrder if it doesn't exist
    if (!config.catalogOrder || config.catalogOrder.length === 0) {
      logger.debug(`Initializing catalogOrder for user ${userId}`);
      config.catalogOrder = config.catalogs.map((c: CatalogManifest) => c.id);
      // Save the updated config with catalogOrder
      this.saveConfig(userId, config);
    }

    // If catalogOrder exists, sort the catalogs array accordingly
    if (config.catalogOrder && config.catalogOrder.length > 0) {
      const orderedCatalogs: CatalogManifest[] = [];

      // First add all catalogs that are in the order array
      for (const catalogId of config.catalogOrder) {
        const catalog = config.catalogs.find((c: CatalogManifest) => c.id === catalogId);
        if (catalog) {
          orderedCatalogs.push(catalog);
        }
      }

      // Then add any catalogs that are not in the order array
      for (const catalog of config.catalogs) {
        if (!config.catalogOrder.includes(catalog.id)) {
          orderedCatalogs.push(catalog);
        }
      }

      // Update the catalogs array with the ordered catalogs
      config.catalogs = orderedCatalogs;
    }

    return config;
  }

  /**
   * Add a catalog manifest to a user's configuration
   */
  async addCatalog(userId: string, manifest: CatalogManifest): Promise<boolean> {
    logger.debug(`Adding catalog ${manifest.id} to user ${userId}`);
    const config = await this.loadConfig(userId);

    // Check if a catalog with the same ID already exists
    const existingIndex = config.catalogs.findIndex((c: CatalogManifest) => c.id === manifest.id);

    if (existingIndex >= 0) {
      logger.debug(`Updating existing catalog at index ${existingIndex}`);
      config.catalogs[existingIndex] = manifest;
    } else {
      logger.debug(`Adding new catalog to list`);
      config.catalogs.push(manifest);

      // Initialize catalogOrder if it doesn't exist
      if (!config.catalogOrder) {
        config.catalogOrder = config.catalogs.map((c: CatalogManifest) => c.id);
      } else {
        // Add the new catalog ID to the order array
        config.catalogOrder.push(manifest.id);
      }
    }

    const success = await this.saveConfig(userId, config);
    if (success) {
      logger.info(`Successfully saved config with ${config.catalogs.length} catalogs`);
    } else {
      logger.error(`Failed to save config`);
    }

    return success;
  }

  /**
   * Remove a catalog from a user's configuration
   */
  async removeCatalog(userId: string, id: string): Promise<boolean> {
    logger.info(`Removing catalog ${id} from user ${userId}`);
    const config = await this.loadConfig(userId);
    const initialLength = config.catalogs.length;

    // Remove from catalogs array
    config.catalogs = config.catalogs.filter((c: CatalogManifest) => c.id !== id);
    logger.debug(`After removal: ${config.catalogs.length} catalogs (was ${initialLength})`);

    // Remove from catalogOrder array if it exists
    if (config.catalogOrder) {
      config.catalogOrder = config.catalogOrder.filter((catalogId: string) => catalogId !== id);
    }

    if (initialLength !== config.catalogs.length) {
      return this.saveConfig(userId, config);
    }

    return false;
  }

  /**
   * Move a catalog up in the list
   */
  async moveCatalogUp(userId: string, id: string): Promise<boolean> {
    logger.debug(`Moving catalog ${id} up for user ${userId}`);
    const config = await this.loadConfig(userId);

    // Initialize catalogOrder if it doesn't exist
    if (!config.catalogOrder) {
      config.catalogOrder = config.catalogs.map((c: CatalogManifest) => c.id);
    }

    // Find the index of the catalog in the order array
    const index = config.catalogOrder.indexOf(id);

    // If catalog not found or already at the top, do nothing
    if (index <= 0) {
      logger.debug(`Catalog ${id} not found or already at the top`);
      return false;
    }

    // Swap the catalog with the one above it in the order array only
    const temp = config.catalogOrder[index];
    config.catalogOrder[index] = config.catalogOrder[index - 1];
    config.catalogOrder[index - 1] = temp;

    logger.debug(`Moved catalog ${id} from position ${index} to ${index - 1}`);
    return this.saveConfig(userId, config);
  }

  /**
   * Move a catalog down in the list
   */
  async moveCatalogDown(userId: string, id: string): Promise<boolean> {
    logger.debug(`Moving catalog ${id} down for user ${userId}`);
    const config = await this.loadConfig(userId);

    // Initialize catalogOrder if it doesn't exist
    if (!config.catalogOrder) {
      config.catalogOrder = config.catalogs.map(c => c.id);
    }

    // Find the index of the catalog in the order array
    const index = config.catalogOrder.indexOf(id);

    // If catalog not found or already at the bottom, do nothing
    if (index === -1 || index >= config.catalogOrder.length - 1) {
      logger.debug(`Catalog ${id} not found or already at the bottom`);
      return false;
    }

    // Swap the catalog with the one below it in the order array only
    const temp = config.catalogOrder[index];
    config.catalogOrder[index] = config.catalogOrder[index + 1];
    config.catalogOrder[index + 1] = temp;

    logger.debug(`Moved catalog ${id} from position ${index} to ${index + 1}`);
    return this.saveConfig(userId, config);
  }

  /**
   * Get a specific catalog for a user
   */
  async getCatalog(userId: string, id: string): Promise<CatalogManifest | undefined> {
    const config = await this.loadConfig(userId);
    return config.catalogs.find((c: CatalogManifest) => c.id === id);
  }

  /**
   * Get all catalogs for a user
   */
  async getAllCatalogs(userId: string): Promise<CatalogManifest[]> {
    // Use getConfig instead of loadConfig to get ordered catalogs
    const config = await this.getConfig(userId);
    logger.info(`Getting all catalogs for user ${userId}: found ${config.catalogs.length}`);
    return config.catalogs;
  }

  /**
   * Check if a user exists
   */
  abstract userExists(userId: string): Promise<boolean> | boolean;

  /**
   * Clear the cache for a specific user
   */
  clearCache(userId: string): void {
    if (this.cache.has(userId)) {
      logger.debug(`Clearing cache for user ${userId}`);
      this.cache.delete(userId);
    }
  }

  /**
   * Clear the entire cache
   */
  clearAllCache(): void {
    logger.debug('Clearing entire cache');
    this.cache.clear();
  }
}
