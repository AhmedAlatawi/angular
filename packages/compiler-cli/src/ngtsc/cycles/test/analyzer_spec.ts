/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ts from 'typescript';
import {absoluteFrom, getFileSystem, getSourceFileOrError} from '../../file_system';
import {runInEachFileSystem} from '../../file_system/testing';
import {ModuleResolver} from '../../imports';
import {Cycle, CycleAnalyzer} from '../src/analyzer';
import {ImportGraph} from '../src/imports';
import {importPath, makeProgramFromGraph} from './util';

runInEachFileSystem(() => {
  describe('cycle analyzer', () => {
    let _: typeof absoluteFrom;
    beforeEach(() => _ = absoluteFrom);

    it('should not detect a cycle when there isn\'t one', () => {
      const {program, analyzer} = makeAnalyzer('a:b,c;b;c');
      const b = getSourceFileOrError(program, (_('/b.ts')));
      const c = getSourceFileOrError(program, (_('/c.ts')));
      expect(analyzer.wouldCreateCycle(b, c)).toBe(null);
      expect(analyzer.wouldCreateCycle(c, b)).toBe(null);
    });

    it('should detect a simple cycle between two files', () => {
      const {program, analyzer} = makeAnalyzer('a:b;b');
      const a = getSourceFileOrError(program, (_('/a.ts')));
      const b = getSourceFileOrError(program, (_('/b.ts')));
      expect(analyzer.wouldCreateCycle(a, b)).toBe(null);
      const cycle = analyzer.wouldCreateCycle(b, a);
      expect(cycle).toBeInstanceOf(Cycle);
      expect(importPath(cycle!.getPath())).toEqual('b,a,b');
    });

    it('should detect a cycle with a re-export in the chain', () => {
      const {program, analyzer} = makeAnalyzer('a:*b;b:c;c');
      const a = getSourceFileOrError(program, (_('/a.ts')));
      const b = getSourceFileOrError(program, (_('/b.ts')));
      const c = getSourceFileOrError(program, (_('/c.ts')));
      expect(analyzer.wouldCreateCycle(a, c)).toBe(null);
      const cycle = analyzer.wouldCreateCycle(c, a);
      expect(cycle).toBeInstanceOf(Cycle);
      expect(importPath(cycle!.getPath())).toEqual('c,a,b,c');
    });

    it('should detect a cycle in a more complex program', () => {
      const {program, analyzer} = makeAnalyzer('a:*b,*c;b:*e,*f;c:*g,*h;e:f;f:c;g;h:g');
      const b = getSourceFileOrError(program, (_('/b.ts')));
      const c = getSourceFileOrError(program, (_('/c.ts')));
      const e = getSourceFileOrError(program, (_('/e.ts')));
      const f = getSourceFileOrError(program, (_('/f.ts')));
      const g = getSourceFileOrError(program, (_('/g.ts')));
      expect(analyzer.wouldCreateCycle(b, g)).toBe(null);
      const cycle = analyzer.wouldCreateCycle(g, b);
      expect(cycle).toBeInstanceOf(Cycle);
      expect(importPath(cycle!.getPath())).toEqual('g,b,f,c,g');
    });

    it('should detect a cycle caused by a synthetic edge', () => {
      const {program, analyzer} = makeAnalyzer('a:b,c;b;c');
      const b = getSourceFileOrError(program, (_('/b.ts')));
      const c = getSourceFileOrError(program, (_('/c.ts')));
      expect(analyzer.wouldCreateCycle(b, c)).toBe(null);
      analyzer.recordSyntheticImport(c, b);
      const cycle = analyzer.wouldCreateCycle(b, c);
      expect(cycle).toBeInstanceOf(Cycle);
      expect(importPath(cycle!.getPath())).toEqual('b,c,b');
    });
  });

  function makeAnalyzer(graph: string): {program: ts.Program, analyzer: CycleAnalyzer} {
    const {program, options, host} = makeProgramFromGraph(getFileSystem(), graph);
    const moduleResolver =
        new ModuleResolver(program, options, host, /* moduleResolutionCache */ null);
    return {
      program,
      analyzer: new CycleAnalyzer(new ImportGraph(moduleResolver)),
    };
  }
});
