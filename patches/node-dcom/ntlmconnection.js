// @ts-check
const Security = require('../security.js');
const NTLMFlags = require('./ntlmflags.js');
const NTLMAuthentication = require('./ntlmauthentication.js');
const Type3Message = require('./messages/type3message.js');
const AuthenticationVerifier = require('../core/authenticationverifier.js');

class NTLMConnection {
    constructor(session) {
        this.session = session;
        this.ntlm = null;
        this.contextId = 0;
        this.authentication = null;
    }

    getProtectionLevel() {
        // Read from session if configured, otherwise default to CONNECT
        if (this.session && this.session.protectionLevel) {
            return this.session.protectionLevel;
        }
        return new Security().PROTECTION_LEVEL_CONNECT;
    }

    getAuthenticationVerifier(pduType, info) {
        if (this.ntlm == null) {
            const usentlmv2 = true;
            if (usentlmv2) {
                this.setSecurity(this.authentication.getSecurity());
            }
        } else if (this.ntlm instanceof Type3Message) {
            const lvl = this.getProtectionLevel();
            if (pduType == 0x00) {
                return new AuthenticationVerifier(
                    new NTLMAuthentication(info).AUTHENTICATION_SERVICE_NTLM, lvl,
                    this.contextId, [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
            } else if (pduType == 0x0e) {
                let auth = [0x4e, 0x54, 0x4c, 0x4d, 0x53, 0x53, 0x50, 0x00, 0x03, 0x00, 0x00, 0x00];
                let empty_body = [...Buffer.alloc(40, 0)];
                let noKeysNoFlags = [0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00];

                let verifier = auth.concat(empty_body);
                verifier = verifier.concat(noKeysNoFlags);
                return new AuthenticationVerifier(
                    new NTLMAuthentication(info).AUTHENTICATION_SERVICE_NTLM, lvl,
                    this.contextId, verifier);
            }
        } else {
            throw new Error("Unrecognized NTLM message.");
        }

        let protectionLevel = this.ntlm.getFlag(NTLMFlags.NTLMSSP_NEGOTIATE_SEAL) ?
            new Security().PROTECTION_LEVEL_PRIVACY : this.ntlm.getFlag(NTLMFlags.NTLMSSP_NEGOTIATE_SIGN) ?
                new Security().PROTECTION_LEVEL_INTEGRITY : this.getProtectionLevel();

        return new AuthenticationVerifier(this.authentication.AUTHENTICATION_SERVICE_NTLM, protectionLevel,
            this.contextId, this.ntlm);
    }

    setSecurity(security) {
        this.security = security;
    }

    getSecurity() {
        return this.security;
    }
}

module.exports = NTLMConnection;
