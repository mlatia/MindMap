/**
 * UT-01..UT-05 - MFE-01 + MBE-02 (FR-11) Auth middleware
 */
import { expect } from 'chai';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../../src/middleware/auth.middleware.js';

function makeRes() {
  const res = { _status: null, _body: null };
  res.status = (c) => { res._status = c; return res; };
  res.json = (b) => { res._body = b; return res; };
  return res;
}

describe('UT-01..UT-05 [MFE-01 + MBE-02] Auth middleware', () => {
  it('UT-01 tolak request tanpa header Authorization (401)', () => {
    const req = { headers: {} };
    const res = makeRes();
    let called = false;
    requireAuth(req, res, () => { called = true; });
    expect(res._status).to.equal(401);
    expect(called).to.equal(false);
  });

  it('UT-02 tolak skema selain Bearer (401)', () => {
    const req = { headers: { authorization: 'Basic xyz' } };
    const res = makeRes();
    requireAuth(req, res, () => {});
    expect(res._status).to.equal(401);
  });

  it('UT-03 tolak JWT yang invalid (401)', () => {
    const req = { headers: { authorization: 'Bearer salah.salah.salah' } };
    const res = makeRes();
    requireAuth(req, res, () => {});
    expect(res._status).to.equal(401);
  });

  it('UT-04 terima JWT valid -> set req.user.id', () => {
    const token = jwt.sign({ id: 42 }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '1h' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    let called = false;
    requireAuth(req, res, () => { called = true; });
    expect(called).to.equal(true);
    expect(req.user).to.deep.equal({ id: 42 });
  });

  it('UT-05 tolak token kedaluwarsa (401)', () => {
    const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '-1s' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    requireAuth(req, res, () => {});
    expect(res._status).to.equal(401);
  });
});
