import { observable, action } from 'mobx';
import axios from 'axios';

function getBasePathFor(projectPath: string): string {
  if (projectPath) {
    return `/api/project/${projectPath}/dependencies`;
  }

  return 'api/global/dependencies';
}

function getNormalizedVersion(version: string): string {
  if (!version) {
    return null;
  }
  const match = version.match(/\d.+/);
  if (!match) {
    return version;
  }
  return match[0];
}

export class DependenciesStore {
  @observable sortKey: string;
  @observable sortReversed: boolean;
  @observable filters: { [key: string]: string } = { name: '', type: '' };
  @observable dependencies: { [key: string]: Dependency.Entire[] } = {};
  @observable dependenciesProcessing: { [key: string]: { [key: string]: boolean } } = {};

  @action
  setSortKey(sortKey: string): void {
    if (this.sortKey === sortKey) {
      if (!this.sortReversed) {
        this.sortReversed = true;
      } else {
        this.sortReversed = false;
        this.sortKey = null;
      }
    } else {
      this.sortKey = sortKey;
      this.sortReversed = false;
    }
  }

  @action
  setFilter(filterKey: string, filterValue: string): void {
    this.filters[filterKey] = filterValue;
  }

  @action
  setDependencies(projectPath: string, dependencies: Dependency.Entire[]): void {
    this.dependencies[projectPath] = dependencies;
    if (!this.dependenciesProcessing[projectPath]) {
      this.dependenciesProcessing[projectPath] = {};
    }
  }

  @action
  setDependencyProcessing(projectPath: string, dependencyName: string, status: boolean): void {
    if (this.dependenciesProcessing[projectPath]) {
      this.dependenciesProcessing[projectPath][dependencyName] = status;
    }
  }

  @action
  async fetchDependencies(projectPath?: string): Promise<void> {
    const responseSimple = await axios
      .get(`${getBasePathFor(projectPath)}/simple`);

    this.setDependencies(projectPath, responseSimple.data);

    const responseFull = await axios
      .get(`${getBasePathFor(projectPath)}`);

    this.setDependencies(projectPath, responseFull.data);
  }

  @action
  async installDependency(
    projectPath: string,
    repo: Dependency.Repo,
    dependency: Dependency.Basic,
    type: Dependency.Type,
  ): Promise<void> {
    this.setDependencyProcessing(projectPath, dependency.name, true);

    await axios.post(
      `${getBasePathFor(projectPath)}/${type}/${repo}`,
      [{ name: dependency.name, version: dependency.version }],
    );

    await this.fetchDependencies(projectPath);

    this.setDependencyProcessing(projectPath, dependency.name, false);
  }

  @action
  async deleteDependency(
    projectPath: string,
    repo: Dependency.Repo,
    dependencyName: string,
    type: Dependency.Type,
  ): Promise<void> {
    this.setDependencyProcessing(projectPath, dependencyName, true);

    await axios.delete(`${getBasePathFor(projectPath)}/${type}/${repo}/${dependencyName}`);

    this.fetchDependencies(projectPath);
  }

  @action
  async installAll(projectPath: string): Promise<void> {
    this.dependencies[projectPath]
      .forEach(dependency => this.setDependencyProcessing(projectPath, dependency.name, true));

    await axios.post(`${getBasePathFor(projectPath)}/install`, {});

    this.dependencies[projectPath]
      .forEach(dependency => this.setDependencyProcessing(projectPath, dependency.name, false));

    this.fetchDependencies(projectPath);
  }

  @action
  async forceReinstallAll(projectPath: string): Promise<void> {
    this.dependencies[projectPath]
      .forEach(dependency => this.setDependencyProcessing(projectPath, dependency.name, true));

    await axios.post(`${getBasePathFor(projectPath)}/install/force`, {});

    this.dependencies[projectPath]
      .forEach(dependency => this.setDependencyProcessing(projectPath, dependency.name, false));

    this.fetchDependencies(projectPath);
  }

  @action
  async updateToVersion(
    projectPath: string,
    dependencies: Dependency.Entire[],
    version: 'installed' | 'wanted' | 'latest',
  )
    : Promise<void> {
    const dependenciesToUpdate = dependencies
      .filter(d => (d[version] && d[version] !== getNormalizedVersion(d.required)));

    dependenciesToUpdate
      .forEach(dependency => this.setDependencyProcessing(projectPath, dependency.name, true));

    const npmDependencies = dependenciesToUpdate.filter(d => ['npm', 'yarn'].includes(d.repo));
    const npmDependenciesDev = npmDependencies.filter(d => d.type === 'dev');
    const npmDependenciesProd = npmDependencies.filter(d => d.type === 'prod');

    const bowerDependencies = dependenciesToUpdate.filter(d => d.repo === 'bower');
    const bowerDependenciesDev = bowerDependencies.filter(d => d.type === 'dev');
    const bowerDependenciesProd = bowerDependencies.filter(d => d.type === 'prod');

    if (npmDependenciesProd.length) {
      await axios.post(
        `${getBasePathFor(projectPath)}/prod/npm`,
        npmDependenciesProd
          .map(d => ({ name: d.name, version: d[version] })));
    }

    if (npmDependenciesDev.length) {
      await axios.post(
        `${getBasePathFor(projectPath)}/dev/npm`,
        npmDependenciesDev
          .map(d => ({ name: d.name, version: d[version] })));
    }

    if (bowerDependenciesProd.length) {
      await axios.post(
        `${getBasePathFor(projectPath)}/prod/bower`,
        bowerDependenciesProd
          .map(d => ({ name: d.name, version: d[version] })));
    }

    if (bowerDependenciesDev.length) {
      await axios.post(
        `${getBasePathFor(projectPath)}/dev/bower`,
        bowerDependenciesDev
          .map(d => ({ name: d.name, version: d[version] })));
    }

    dependenciesToUpdate
      .forEach(dependency => this.setDependencyProcessing(projectPath, dependency.name, false));

    this.fetchDependencies(projectPath);
  }
}

export const dependenciesStore = new DependenciesStore();
