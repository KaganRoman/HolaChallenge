var _ = require('underscore');


(function(exports) {


	exports.learn = function(pos, neg) {

    var seed = 0x123456;
    var rawKey = new ArrayBuffer(8);
    var byteView = new Int8Array(rawKey);
        byteView[0] = 0xDE; byteView[1] = 0xAD; byteView[2] = 0xBE; byteView[3] = 0xEF;
        byteView[4] = 0xFE; byteView[5] = 0xED; byteView[6] = 0xFA; byteView[7] = 0xCE;
    var h = new hll.HLL(17/*log2m*/, 5/*registerWidth*/);
        //h.addRaw(library.x86.hash128(rawKey, seed));

		_.each(pos, function(w) { 
			var hs = library.x64.hash128(w, seed)
//			if(h.hllSet.cardinality() < 10000)
				h.addRaw(hs);
		});

		var cnt = h.cardinality();
		var out = h.toHexString();
		var json = JSON.stringify(out);

		console.log("HLL count: " + cnt + ", original: " + pos.length + ", size: " + json.length);

		var found = 0;
		var checked = 0;
/*
		_.each(pos, function(w) {
			var h1 = HyperLogLog(17);
			h1.merge(h.output());
			h1.add(library.x86.hash128(w));
			if(h1.count() === cnt) found = found + 1;
			checked = checked + 1;


			if(checked%1000 === 0) console.log("Found: " + found + " of " + checked + ", %" + found*100.0/checked);
		});
*/
		var failed = 0;
		checked = 0;

		_.each(neg, function(w) {
			var hs = library.x64.hash128(w, seed)
	
			var h1 = h.clone();
            h1.addRaw(hs);
            if(h1.cardinality() === cnt) failed = failed + 1;

			checked = checked + 1;

			if(checked%1000 === 0) console.log("Failed: " + failed + " of " + checked + ", %" + failed*100.0/checked);
		});

		console.log("Failed: " + failed);

    	return json
	}


	exports.init = function(data) {
		//positives = new BloomFilter(JSON.parse(data), 2);
	}

	exports.test = function(w) { 
		//return positives.test(word);
		return false
	}


function compute_alpha_times_bucket_count_squared(bucket_count) {
    return 0.7213 / (1 + 1.079 / bucket_count) * bucket_count * bucket_count;
}


// ** Config ***************************************************************
    // default register width and number when loading explicit sets
    var DEFAULT_REGISTER_WIDTH = 5/*schema v1*/,
        DEFAULT_LOG2M = 13/*schema v1*/;

    // -------------------------------------------------------------------------
    var LOWER = 0/*lower 32bits of the hashed value*/,
        UPPER = 1/*upper 32bits of the hashed value*/;

    // ** Set Representation ***************************************************
    /**
     * Creates a new HLL structure with the specified precision.
     *
     * @param {Number} [log2m=DEFAULT_LOG2M] the log-base-2 of the number of 
     *        registers. This cannot be less than four or greater than 24.
     * @param {Number} [registerWidth=DEFAULT_REGISTER_WIDTH] the width in bits 
     *        of the register values. This is <code>ceil(log2(log2(expectedUniqueElements)))</code>
     *        and cannot be less than one or greater than five.
     * @constructor
     */
    // NOTE:  the register width is limited to at most 5 since that provides for
    //        a maximum register value of 31 which is the limit of the JavaScript
    //        bit shifting operators.
    var hll = { util: {}}
    hll.HLL = function(log2m, registerWidth) {
        var self = this;

        if(arguments.length < 1) log2m = DEFAULT_LOG2M;
        if(arguments.length < 2) registerWidth = DEFAULT_REGISTER_WIDTH;
        if((log2m < 4) || (log2m > 24)) throw new Error("Register width must be between 4 and 24 inclusive (log2m = " + log2m + ").");
        if((registerWidth < 1) || (registerWidth > 5)) throw new Error("Register width must be between 1 and 5 inclusive (registerWidth = " + registerWidth + ").");

        // .. initialization ...................................................
        self.log2m = log2m;
        self.m = 1 << log2m/*for convenience*/;

        self.registerWidth = registerWidth;

        // NOTE:  there are two approaches that can be taken on storage:
        //        1.  Simply use an array of register values. This results in
        //            the easiest to read and maintain code but consumes considerably
        //            more memory than is necessary. (64bits are used for every
        //            register even though the register width is always less
        //            than or equal to 6.)
        //        2.  Use an ArrayBuffer to encode exactly '2^log2m * registerWidth'
        //            bits. This results in highly complex code to both read and
        //            maintain but is provides for optimal storage.
        //        Currently the first approach is taken.
        self.registers = [];
        for(var i=self.m-1; i>=0; i--) self.registers.push(0);

        // .. initialize meta values ...........................................
        // register count/width meta values
        var maxRegisterValue = ((1 << self.registerWidth/*2^registerWidth*/) - 1) >>> 0;
        var registerIndexMask = ((1 << log2m) - 1) >>> 0/*the mask applied to the lower-4bytes of the hashed value to get the register index*/;

        // cardinality estimation meta values
        var PW_BITS = maxRegisterValue - 1,
            L = PW_BITS + log2m,
            TWO_TO_L = Math.pow(2, L)/*L may be larger than 32 so '<<' cannot be used*/;

        var LARGE_ESTIMATOR_CUTOFF = (TWO_TO_L / 30),
            SMALL_ESTIMATOR_CUTOFF = 5 * self.registers.length/*m*/ / 2;

        var ALPHA_M_SQUARED = cardinalityAlphaMSquared(self.m);

        // =====================================================================
        function rho(value/*w*/) {
            // NOTE:  by contract the value must be 32bits (therefore only LOWER is needed)
            // NOTE: there are two approaches: mask "value" so that there are 1's
            //       in the upper bits or do a min. The former is more performant
            //       the latter is easier to read.
            var lsb = hll.util.leastSignificantBit(value[LOWER]) + 1/*since 1-based*/;
            return Math.min(maxRegisterValue, lsb);
        };
        
        /**
         * @param {Array} a two element array that contains the upper- (index 1) 
         *        and lower-32bit (index 0) bit values (of a 64bit hashed value) 
         *        to be added to this set. This must be specified and cannot be 
         *        null.  
         * @returns {hll.HLL}
         */
        self.addRaw = function(hashValue) {
            var registerIndex = hashValue[LOWER] & registerIndexMask/*by contract <32bits so LOWER is sufficient*/;
            var registerValue = rho(hll.util.shiftRightUnsignedLong(hashValue, log2m));
            self.registers[registerIndex] = Math.max(self.registers[registerIndex], registerValue);
        };

        // ---------------------------------------------------------------------
        /**
         * @returns {Number} the estimated cardinality of the set as a floating 
         *          point number.
         * @see http://algo.inria.fr/flajolet/Publications/FlFuGaMe07.pdf
         */
        self.algorithmCardinality = function() {
            var m = self.m/*for convenience*/;

            // compute the "indicator function" -- sum(2^(-M[j])) where M[j] is 
            // the 'j'th register value
            var sum = 0.0;
            var numberOfZeroes = 0/*"V" in the paper*/;
            var registers = self.registers/*for performance*/;
            for(var j=m-1; j>=0; j--) {
                var registerValue = registers[j];

                sum += 1.0 / ((1 << registerValue/*2^registerValue*/)/*registerValue < 32 by contract*/ >>> 0)/*unsigned*/;
                if(registerValue == 0) numberOfZeroes++;
            }

            // apply the estimate and correction to the indicator function
            var estimator = ALPHA_M_SQUARED / sum;
            if((numberOfZeroes != 0) && (estimator < SMALL_ESTIMATOR_CUTOFF))
                return m * Math.log(m / numberOfZeroes);
            else if(estimator <= LARGE_ESTIMATOR_CUTOFF)
                return estimator;
            else
                return (-1 * TWO_TO_L) * Math.log(1.0 - (estimator / TWO_TO_L));
        };

        /**
         * @returns {Number} the estimated cardinality of the set <code>ceil</code>'d
         *          up to an integral number.
         * @see http://algo.inria.fr/flajolet/Publications/FlFuGaMe07.pdf
         */
        self.cardinality = function() {
            return Math.ceil(self.algorithmCardinality());
        };

        // ---------------------------------------------------------------------
        /**
         * @return {Number} the standard error based on log2m (the number of registers)
         * @see http://algo.inria.fr/flajolet/Publications/FlFuGaMe07.pdf
         */
        self.cardinalityError = function() {
            return 1.04 / Math.sqrt(1 << log2m/*2^log2m = m*/);
        };

        // =====================================================================
        /**
         * @param {hll.HLL} otherSet another HLL. <code>log2m</code> and <code>registerWidth</code> 
         *        must be identical for the two sets otherwise an exception is 
         *        thrown. This set is not modified in any way.
         * @returns {hll.HLL} the unioned results (which is this object).
         * @throws {Error} if the <code>log2m</code> and <code>registerWidth</code>
         *         of this set and the specified one do not match. 
         */
        self.union = function(otherSet) {
            // NOTE:  currently precluding unioning with different sized sets
            if((self.log2m != otherSet.log2m) || (self.registerWidth != otherSet.registerWidth)) throw new Error("Union of sets with different 'log2m' " + ((self.log2m == otherSet.log2m) ? "" : "(" + self.log2m + " != " + otherSet.log2m + ") ") + "or 'registerWidth'" + ((self.registerWidth == otherSet.registerWidth) ? "" : " (" + self.registerWidth + " != " + otherSet.registerWidth + ")") + ".");

            var selfRegisterCount = self.m,
                otherRegisterCount = otherSet.m;
            var registerCount = Math.min(selfRegisterCount, otherRegisterCount);

// TODO:  re-incorporate when contract updated
// TODO:  don't change 'otherSet' since it's not in the contract. Make a clone.
//            // 'fold' the larger set until it is the same size as this set
//            var largerSet = selfRegisterCount > otherRegisterCount ? self : otherSet;
//            while(largerSet.registers.length != registerCount)
//                largerSet.fold();

            var selfRegisters = self.registers/*for performance*/, 
                otherRegisters = otherSet.registers/*for performance*/;
            for(var i=registerCount-1; i>=0; i--)
                selfRegisters[i] = Math.max(selfRegisters[i], otherRegisters[i]);

            return self;
        };

        /**
         * 'Folds' a set down to the specified <code>log2m</code> as per 
         * {@link http://blog.aggregateknowledge.com/2012/09/12/set-operations-on-hlls-of-different-sizes/}.
         * 
         * @param {Number} the desired <code>log2m</code> (which determines the
         *        relative error) of the HLL. This cannot be less than one or
         *        greater than the current value.
         * @returns {hll.HLL} a duplicate of this set, folded to match the specified
         *          <code>log2m</code>. The current set is left untouched.
         * @throws {Error} if the specified <code>log2m</code> is less than two
         *         or greater than the current value.
         */
        self.fold = function(log2m) {
            if(log2m == self.log2m) return self.clone()/*trivial case -- by contract it must be a duplicate*/;
            if((log2m < 1) || (log2m > self.log2m)) throw new Error("'log2m' cannot be less than 1 or greater than the current value.");

            // assume log2m=6 and registerWidth=5. Then there will be 6bits that
            // compose the index (I) and at most '2^5 - 1 = 31' bits that compose
            // the register value (V):
            //    0b ---- ---- ---V VVVV  VVVV VVVV VVVV VVVV  VVVV VVVV VVII IIII
            // Folding by one (log2m=6 -> log2m=5) means that one bit that was
            // previously in the index is now part of the register value:
            //    0b ---- ---- ---- VVVV  VVVV VVVV VVVV VVVV  VVVV VVVV VvVI IIII
            // (shown as a lower case 'v' to make it clear). Since the HLL 
            // algorithm uses the least-significant set bit ('1') of the register 
            // value, there are two possible cases:
            // 1.  The upper bit of the old index (which is now the lower bit
            //     of the register value) was set to '1' in which case the new
            //     register value is '1';
            // 2.  The upper bit of the old index was set to '0' in which case
            //     the new register value is 'min(oldRegisterValue + 1, 31)';
            // Case #1 means that the upper half of the registers can be ignored
            // since the *maximum* register value of case #1 is '1' where as the
            // *minimum* register value in case #2 is '1'.
            // This can be easily extended to folding 'n' times.
            // SEE:  http://blog.aggregateknowledge.com/2013/03/25/hyperloglog-engineering-choosing-the-right-bits/
            // NOTE:  since 'registerWidth' does not change the same 'maxRegisterValue'
            //        is to be used
            var hllSet = new hll.HLL(log2m, self.registerWidth);
            var foldedRegisters = hllSet.registers/*for performance*/,
                selfRegisters = self.registers/*for performance*/;
            var difference = self.log2m - log2m,
                foldedM = hllSet.m/*by definition*/;
            for(var i=foldedM-1; i>=0; i--)
                foldedRegisters[i] = Math.min(selfRegisters[i] + difference, maxRegisterValue)/*bound above by 'maxRegisterValue'*/;

            return hllSet;
        };

        // =====================================================================
        /**
         * @returns {hll.HLL} a clone of this set (with no remaining references
         *          to the original set.
         */
        self.clone = function() {
            var clone = new hll.HLL(self.log2m, self.registerWidth);
            // copy all registers
            var selfRegisters = self.registers/*for performance*/, 
                cloneRegisters = clone.registers/*for performance*/;
            for(var i=self.m-1; i>=0; i--)
                cloneRegisters[i] = selfRegisters[i];

            return clone;
        };

        /**
         * @returns {hll.HLL} this object with all of its register values set 
         *          to zero.
         */
        self.clear = function() {
            var registers = self.registers/*for performance*/; 
            for(var i=self.m-1; i>=0; i--)
                registers[i] = 0/*clear*/;

            return self;
        };

        // =====================================================================
        /**
         * Encodes this structure into a hexadecimal string in the format 
         * described in <code>STORAGE.markdown</code> schema version 1. Only 
         * <tt>FULL</tt> representations are supported.
         * 
         * @return {String} the string that encodes this HLL structure
         */
        self.toHexString = function() {
            // byte layout VPCB*'
            var writer = new hll.util.ByteWriter();

            // version byte: schema 1, full
            writer.addBits(0x14, 8);
            // parameter byte:
            // *  top 3 bits: registerWidth - 1
            // *  bottom 5 bits: log2m
            writer.addBits(registerWidth - 1, 3);
            writer.addBits(log2m, 5);
            // cutoff byte
            writer.addBits(0, 8)/*1 bit of padding, explicit enabled = 0, explicit cuttoff = 0*/;

            // The data bytes encode the register values in 'registerWidth'-bit-wide 
            // "short words". The words are stored in _ascending_ index order

            // If 'BITS = registerWidth * numberOfRegisters' is not divisible by
            // 8, then 'BITS % 8' padding bits are added to the _bottom_ of the 
            // _last_ byte of the array

            // The short words are written from the top of the zero-th byte of
            // the array to the bottom of the last byte of the array, with the
            // high bits of the short words toward the high bits of the byte.

            var m = self.m/*for performance*/;
            var registers = self.registers/*for performance*/;
            for(var i=0; i<m; i++) /*NOTE: iteration order matters*/
                writer.addBits(registers[i], registerWidth);
            // NOTE:  ByteWriter automatically has padding to fit evenly into a byte

            return hll.util.hexfromByteArray(writer.getBytes());
        };
    };

    // =========================================================================
    /**
     * @param {Number} m must be a power of two, cannot be less than 16
     *        (2<sup>4</sup>), and cannot be greater than 65536 (2<sup>16</sup>).
     * @returns {Number} gamma times <code>m</code> squared where gamma is based 
     *          on the value of <code>m</code>
     * @throws {Error} if <code>m</code> is less than 16
     */
    function cardinalityAlphaMSquared(m) {
        switch(m) {
            case 1/*2^0*/:
            case 2/*2^1*/:
            case 4/*2^2*/:
            case 8/*2^3*/:
                throw new Error("'m' cannot be less than 16 (" + m + " < 16).");

            case 16/*2^4*/:
                return 0.673 * m * m;

            case 32/*2^5*/:
                return 0.697 * m * m;

            case 64/*2^6*/:
                return 0.709 * m * m;

            default/*>2^6*/:
                return (0.7213 / (1.0 + 1.079 / m)) * m * m;
        }
    }

    // ** Parsing **************************************************************
    // number of bits in a byte
    var BITS_IN_BYTE = 8;

    // schema version constants
    var SCHEMA1 = 1;

    // algorithm constants
    hll.algorithm = {
        EMPTY: "Empty",
        EXPLICIT: "Explicit",
        SPARSE: "Sparse",
        FULL: "Full",
        UNDEFINED: "Undefined"
    };

    // schema version 1 algorithm indexes
    var schema1 = {
        UNDEFINED : 0,
        EMPTY : 1,
        EXPLICIT : 2,
        SPARSE : 3,
        FULL : 4
    };

    // =========================================================================
    /**
     * Decodes an HLL encoded in the specified hexadecimal string as defined by
     * <code>STORAGE.markdown</code>.
     * 
     * @param {String} string the string to decode
     * @returns {{hllSet: hll.HLL, version: Number, algorithm: String}}
     *          <code>set</code> the HLL object loaded from the hex string.
     *          <code>version</code> the schema version number. 
     *          <code>algorithm</code> the name of the encoding {@link hll.algorithm algorithm}. 
     */
    hll.fromHexString = function(string) {
        var arrayBuffer = hll.util.hexToArrayBuffer(string);
        return parseSet(arrayBuffer);
    };

    /**
     * @param  {ByteArray} arrayBuffer an encoded HLL as defined by <code>STORAGE.markdown</code>.
     * @returns {{hllSet: hll.HLL, version: Number, algorithm: String}}
     *          <code>hllSet</code> the HLL object loaded from the hex string.
     *          <code>version</code> the schema version number. 
     *          <code>algorithm</code> the name of the encoding {@link hll.algorithm algorithm}. 
     */
    var parseSet = function(arrayBuffer) {
        // SEE: STORAGE.markdown

        // byte array format: V*
        var bytes = new Uint8Array(arrayBuffer);

        // the schema value is stored in the upper nibble of the version byte,
        // while the algorithm version is stored in the lower nibble of that byte
        var version = hll.util.upperNibble(bytes[0/*V*/]),
            algorithm = hll.util.lowerNibble(bytes[0/*V*/]);

        if(version == SCHEMA1) {
            switch(algorithm) {
                case schema1.UNDEFINED:
                    return { hllSet: schema1_empty(arrayBuffer), version: version, algorithm: hll.algorithm.UNDEFINED };
                case schema1.EMPTY:
                    return { hllSet: schema1_empty(arrayBuffer), version: version, algorithm: hll.algorithm.EMPTY };
                case schema1.EXPLICIT:
                    return { hllSet: schema1_explicit(arrayBuffer), version: version, algorithm: hll.algorithm.EXPLICIT };
                case schema1.SPARSE:
                    return { hllSet: schema1_sparse(arrayBuffer), version: version, algorithm: hll.algorithm.SPARSE };
                case schema1.FULL:
                    return { hllSet: schema1_full(arrayBuffer), version: version, algorithm: hll.algorithm.FULL };
                default:
                    throw new Error("Unknown schema version 1 algorithm (index): " + algorithm);
            }
        } else /*unknown*/
            throw new Error("Unknown schema version: " + version);
    };

    // == Schema v1 ============================================================
    // @param {Number} parameterByte the parameter byte that is to be parsed 
    // @returns {{ log2m: Number, registerWidth: Number }} the parsed register
    //          width and log2m
    function schema1_parameters(parameterByte) {
        // highest 3 bits encode the value 'registerWidth - 1' and the remaining 
        // 5 bits encode 'log2m'
        return { registerWidth: hll.util.getBitSequenceFromByte(parameterByte, 0, 3) + 1,
                 log2m: hll.util.getBitSequenceFromByte(parameterByte, 3, 5) };
    }
    // @param {ArrayBuffer} arrayBuffer array buffer encoding a schema v1 'FULL' 
    // @returns {hll.HLL} a new HLL decoded from the <code>ArrayBuffer</code>
    function schema1_full(arrayBuffer) {
        // byte array format: VPCB*
        var bytes = new Uint8Array(arrayBuffer);

        var parameters = schema1_parameters(bytes[1/*P*/]);
        var registerWidth = parameters.registerWidth/*for convenience*/,
            log2m = parameters.log2m/*for convenience*/,
            m = 1 << log2m/*2^log2m*/;

        // the values are stored in 'registerWidth' bit wide ascending sequence
        var registers = [];
        var byteOffset = 3 * BITS_IN_BYTE/*VPC*/;
        for(var i=m-1; i>=0; i--) {
            registers.push(hll.util.getBitSequenceValueFromByteArray(bytes, byteOffset, registerWidth));
            byteOffset += registerWidth;
        }

        var hllSet = new hll.HLL(log2m, registerWidth);
            hllSet.registers = registers;
        return hllSet;
    }
    // @param {ArrayBuffer} arrayBuffer array buffer encoding a schema v1 'SPARSE' 
    // @returns {hll.HLL} a new HLL decoded from the <code>ArrayBuffer</code>
    function schema1_sparse(arrayBuffer) {
        // byte array format: VPCB*
        var bytes = new Uint8Array(arrayBuffer);
        return common_sparse(arrayBuffer, 3/*VPC*/, schema1_parameters(bytes[1/*P*/]));
    }
    // @param {ArrayBuffer} arrayBuffer array buffer encoding a schema v1 'EMPTY' 
    // @returns {hll.HLL} a new HLL decoded from the <code>ArrayBuffer</code>
    function schema1_empty(arrayBuffer) {
        var bytes = new Uint8Array(arrayBuffer);
        return common_empty(schema1_parameters(bytes[1/*P*/]));
    }
    // @param {ArrayBuffer} arrayBuffer array buffer encoding a schema v1 'EXPLICIT' 
    // @returns {hll.HLL} a new HLL decoded from the <code>ArrayBuffer</code>
    function schema1_explicit(arrayBuffer) {
        // byte array format: VPCB{8}*
        var bytes = new Uint8Array(arrayBuffer);
        return common_explicit(arrayBuffer, 3/*VPC*/, schema1_parameters(bytes[1/*P*/]));
    }

    // == Decoding Common ======================================================
    // @param {{ log2m: Number, registerWidth: Number }} parameters the register
    //        width and log2m parameters
    // @returns {hll.HLL} a new HLL with the specified parameters
    function common_empty(parameters) {
        return new hll.HLL(parameters.log2m, parameters.registerWidth);
    }

    // @param {ArrayBuffer} arrayBuffer array buffer encoding an 'EXPLICIT' set
    // @param {Number} offset the offset in the array buffer to the data bytes
    // @param {{ log2m: Number, registerWidth: Number }} parameters the register
    //        width and log2m parameters
    // @returns {hll.HLL} a new HLL decoded from the <code>ArrayBuffer</code>
    function common_explicit(arrayBuffer, offset, parameters) {
        var hllSet = new hll.HLL(parameters.log2m, parameters.registerWidth);

        // Each block of 8 bytes represent a signed 64-bit integer (sign bit + 
        // 63 value bits). These integers are encoded as big-endian (with sign-bit 
        // at highest position), and are the "contents" of the multiset.
        var bytes = new Uint8Array(arrayBuffer);
        var byteOffset = offset;
        while(byteOffset < bytes.length) {
            // load the tuple from the byte array at the given offset
            var value = hll.util.extractLong(bytes, byteOffset);
            hllSet.addRaw(value);

            // move forward 8 bytes to the next value;
            byteOffset += 8/*bytes in 'long'*/;
        }

        return hllSet;
    }

    // @param {ArrayBuffer} arrayBuffer array buffer encoding an 'EXPLICIT' set
    // @param {Number} offset the offset in the byte array to the data bytes
    // @param {{ log2m: Number, registerWidth: Number }} parameters the register
    //        width and log2m parameters
    // @returns {hll.HLL} a new HLL decoded from the <code>ArrayBuffer</code>
    function common_sparse(arrayBuffer, offset, parameters) {
        var registerWidth = parameters.registerWidth/*for convenience*/,
            log2m = parameters.log2m/*for convenience*/,
            m = 1 << log2m/*2^log2m*/;

        var registers = [];
        for(var i=m-1; i>=0; i--) registers.push(0/*initialize*/);

        // If 'BITS = registerWidth * m' is not divisible by 8, then 'BITS % 8' 
        // padding bits are added to top of the first byte of the array account 
        // for this padding
        var bitOffset = offset * BITS_IN_BYTE/*after offset*/;
            bitOffset += (m * registerWidth) % BITS_IN_BYTE;

        var bytes = new Uint8Array(arrayBuffer);
        var registerCount = Math.floor(((bytes.length - offset)/*data bytes*/ * BITS_IN_BYTE) / (log2m + registerWidth));
        for(var i=registerCount-1; i>=0; i--) {
            var key = hll.util.getBitSequenceValueFromByteArray(bytes, bitOffset, log2m);
            bitOffset += log2m;
            var value = hll.util.getBitSequenceValueFromByteArray(bytes, bitOffset, registerWidth);
            bitOffset += registerWidth;

            registers[key] = value;
        }

        var hllSet = new hll.HLL(log2m, registerWidth);
            hllSet.registers = registers;
        return hllSet;
    }

var BITS_IN_BYTE = 8;

    // -------------------------------------------------------------------------
    var LOWER = 0/*lower 32bits of a 'long' value*/,
        UPPER = 1/*upper 32bits of a 'long' value*/;

    // *************************************************************************
    /**
     * @param {Array} a two element array that contains the upper- (index 1) 
     *        and lower-32bit (index 0) bit values of a 64bit value.
     * @param {Number} the number of bits to be shifted right. If negative or 
     *        greater than 63 then it is made positive or bounded to [0, 63]
     * @returns {Array} the specified long value shifted right by the specified 
     *          amount with the left-padded bits matching that of the sign bit. 
     */
    hll.util.shiftRightLong = function(longValue, shift) {
        shift &= 63/*by contract*/;
        if(shift == 0) return longValue/*nothing to do*/;

        var upper = longValue[UPPER]/*for convenience*/;
        if(shift < 32) {
            var lower = longValue[LOWER]/*for convenience*/;
            return [ ((lower >>> shift) | (upper << (32 - shift))),
                     (upper >> shift) ];
        } else { /*shift >= 32*/
            return [ (upper >> (shift - 32)),
                     (upper >= 0 ? 0 : -1) ];
        }
    };

    /**
     * @param {Array} a two element array that contains the upper- (index 1) 
     *        and lower-32bit (index 0) bit values of a 64bit value.
     * @param {Number} the number of bits to be shifted right. If negative or 
     *        greater than 63 then it is made positive or bounded to [0, 63]
     * @returns {Array} the specified long value shifted right by the specified 
     *          amount with the left-padded bits set to zero. 
     */
    hll.util.shiftRightUnsignedLong = function(longValue, shift) {
        shift &= 63/*by contract*/;
        if(shift == 0) return longValue/*nothing to do*/;

        var upper = longValue[UPPER]/*for convenience*/;
        if(shift < 32) {
            var lower = longValue[LOWER]/*for convenience*/;
            return [ ((lower >>> shift) | (upper << (32 - shift))),
                     (upper >>> shift) ];
        } else if(numBits == 32)
          return [ upper, 0/*clear upper*/ ];
        else /*shift > 32*/
          return [ (upper >>> (shift - 32)), 0/*clear upper*/ ];
    };
    
    // -------------------------------------------------------------------------
    /**
     * Load a long (64bit) integer from the given byte array, starting from the
     * given byte position.
     *
     * @param {Array} bytes array of bytes, with long values packed from the 0th
     *        byte in 8 byte intervals. Long values are stored big endian.
     * @param {Number} startByteIndex index into the array to the upper byte of 
     *        the long value
     * @returns {Array} a two element array that contains the upper- (index 1) 
     *          and lower-32bit (index 0) bit values of the extracted 64bit value.
     */
    hll.util.extractLong = function(bytes, startByteIndex) {
        var lower = 0,
            upper = 0;

        // load 8 bytes, big endian order
        upper |= bytes[startByteIndex    ] << 24;
        upper |= bytes[startByteIndex + 1] << 16;
        upper |= bytes[startByteIndex + 2] <<  8;
        upper |= bytes[startByteIndex + 3];
        lower |= bytes[startByteIndex + 4] << 24;
        lower |= bytes[startByteIndex + 5] << 16;
        lower |= bytes[startByteIndex + 6] <<  8;
        lower |= bytes[startByteIndex + 7];

        return [ lower >>> 0, upper >>> 0 ];
    };

    // =========================================================================
    /**
     * @param {Number} byteValue a byte
     * @returns {Number} the upper nibble (4bits) of that byte
     */
    hll.util.upperNibble = function(byteValue) {
        return byteValue >> 4;
    };

    /**
     * @param {Number} byteValue a byte
     * @returns {Number} the lower nibble (4bits) of that byte
     */
    hll.util.lowerNibble = function(byteValue) {
        return byteValue & 0x0F;
    };

    // =========================================================================
    /**
     * Decodes an array of bytes from a hex string.
     *
     * @param {String} hex string of hex digits, starts with two characters to 
     *         be discarded "\x", "0x", or similar, the number of hex digits 
     *         must be an even number, come out to a round number of bytes
     * @returns {ArrayBuffer} an <code>ArrayBuffer</code> of values representing 
     *          the bytes encoded in the hex string
     */
    hll.util.hexToArrayBuffer = function(hex) {
        hex = hex.substring(2/*discard the first two characters "0x, \x"*/);
        var length = hex.length / 2/*each hex digit is 4bits, or 1/2 byte*/;
        // allocate the byte array of the correct size.
        var arrayBuffer = new ArrayBuffer(length);
        var byteView = new Uint8Array(arrayBuffer);

        for(var i=0; i<length; i++) {
            // parse two hex digits into a byte
            var byteString = hex[i * 2] + hex[i * 2 + 1];
            byteView[i] = parseInt(byteString, 16);
        }

        return arrayBuffer;
    };

    /**
     * Encodes a hex string from an array of bytes.
     *
     * @param {Array} bytes the bytes to encode
     * @returns {String} the encoded hex string which will start with '/x'
     */
    hll.util.hexfromByteArray = function(bytes) {
        var hex = "/x";
        for(var i=0; i<bytes.length; i++) {
            var byteValue = bytes[i];
            hex += (byteValue < 0x10 ? "0" : ""/*ensure 2 digits per byte*/) + byteValue.toString(16);
        }
        return hex;
    };

    // =========================================================================
    /**
     * @param {Number} byteValue a byte
     * @param {Number} start the bit index starting from the top-bit
     * @param {Number} length the number of bits to include in the sequence
     * @returns {Number} unsigned integer representing the bits from <code>start</code>
     *          to <code>start + length</code> in the value
     */
    hll.util.getBitSequenceFromByte = function(byteValue, start, length) {
        return (byteValue >>> (BITS_IN_BYTE - (start + length))) & 
                   ((1 << length) - 1)/*mask of width 'length'*/;
    };

    // -------------------------------------------------------------------------
    /**
     * Retrieves the value of the integer between the given start and end bit 
     * indexes from an array of bytes in big-endian order.
     *
     * @param {Array} bytes the byte array from which the number is read
     * @param {Number} start the index of the start of the bit sequence
     * @param {Number} length the length of the sequence of bits. This must be 
     *        less than 32.
     * @returns {Number} the value of the specified sequence of bits
     */
    // TODO:  this can use some consistency clean-up
    hll.util.getBitSequenceValueFromByteArray = function(bytes, start, length) {
        // determine the start and end byte and bit indices of the requested bit sequence
        var byteStartIndex = start >>> 3/*divide by BITS_IN_BYTE*/;
        var byteEndIndex = (start + length) >>> 3/*divide by BITS_IN_BYTE*/;
        var bitStartIndex = start & 0x07/*% BITS_IN_BYTE*/;

        // if the value exists within a single byte, simply grab that value out of
        // the single byte
        if(byteStartIndex == byteEndIndex) return hll.util.getBitSequenceFromByte(bytes[byteEndIndex], bitStartIndex, length);

        var bitEndIndex = (start + length) & 0x07/*% BITS_IN_BYTE*/;

        // iterate through the byte array from the end byte index to the start
        // byte index, accumulating the value.
        var result = 0;
        var shift = 0;
        for(var i=byteEndIndex; i>=byteStartIndex; i--) {
            var byteValue;
            if(i == byteStartIndex)
                byteValue = hll.util.getBitSequenceFromByte(bytes[i], bitStartIndex, BITS_IN_BYTE - bitStartIndex);
            else if(i == byteEndIndex)
                byteValue = hll.util.getBitSequenceFromByte(bytes[i], 0, bitEndIndex);
            else /*use the entire byte, if it is not the start or end bytes*/
                byteValue = bytes[i];

            result |= byteValue << shift;

            if(i == byteEndIndex)
                shift += bitEndIndex;
            else
                shift += BITS_IN_BYTE;
        }

        return result;
    };

    // =========================================================================
    // least significant bit
    // REF:  http://stackoverflow.com/questions/757059/position-of-least-significant-bit-that-is-set
    // REF:  http://www-graphics.stanford.edu/~seander/bithacks.html
    var LEAST_SIGNIFICANT_BIT = [/*0-based*/
        -1, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0,
         4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0,
         5, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0,
         4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0,
         6, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0,
         4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0,
         5, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0,
         4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0,
         7, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0,
         4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0,
         5, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0,
         4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0,
         6, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0,
         4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0,
         5, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0,
         4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0
    ];
    /**
     * @param {Number} value a 32bit value for which the least-significant bit
     *        set is desired. This cannot be null, greater than 32bits, or unspecified.
     * @returns {Number} the 0-based position of the least-significant bit set.
     */
    hll.util.leastSignificantBit = function(value) {
        if(value == 0) return -1/*by contract*/;
        if((value & 0x0000FF) != 0) return LEAST_SIGNIFICANT_BIT[( (value >>>  0) & 0xFF)] +  0;
        if((value & 0x00FFFF) != 0) return LEAST_SIGNIFICANT_BIT[( (value >>>  8) & 0xFF)] +  8;
        if((value & 0xFFFFFF) != 0) return LEAST_SIGNIFICANT_BIT[( (value >>> 16) & 0xFF)] + 16;
        return LEAST_SIGNIFICANT_BIT[( (value >>> 24) & 0xFF)] + 24;
    };

    // *************************************************************************
    /**
     * Creates a new mechanism for writing data into a byte array.
     * @constructor
     */
    hll.util.ByteWriter = function() {
        var self = this;

        var currentByte = 0;
        var bytes = [];
        var remainingBitsInByteCount = BITS_IN_BYTE;

        // ---------------------------------------------------------------------
        /**
         * Write bits to the tail end of the byte array writing from the upper
         * bits of each byte.
         *
         * @param {Number} value the value to add to the byte array
         * @param {Number} bitCount number of bits starting from the lower bits
         *         of the value to add to the byte array, at most 32 bits
         */
        self.addBits = function(value, bitCount) {
            var remainingBitsInValueCount = bitCount;
            while(remainingBitsInValueCount > 0) {
                // the value is taken from the lower bits of 'value' but read 
                // starting from the upper bit(s)
                var writeBitCount = Math.min(remainingBitsInValueCount, remainingBitsInByteCount);
                var writeValue = ((value >>> (remainingBitsInValueCount - writeBitCount)) &
                                  ((1 << writeBitCount) - 1)/*mask of width 'writeBitCount'*/) >>> 0;

                // writing starts at the upper bit(s)
                currentByte |= (writeValue << (remainingBitsInByteCount - writeBitCount));

                remainingBitsInValueCount -= writeBitCount;
                remainingBitsInByteCount -= writeBitCount;
                if(remainingBitsInByteCount <= 0) {
                    bytes.push(currentByte);
                    currentByte = 0/*clear*/;
                    remainingBitsInByteCount = BITS_IN_BYTE/*reset*/;
                } /* else -- not a full byte yet */
            }
        };

        /**
         * @returns {Array} the bytes that have been {@link #addBits() added}
         *          to this writer. Modifying this array will modify the internal
         *          storage.
         */
        self.getBytes = function() {
            if(remainingBitsInByteCount < BITS_IN_BYTE) { /*bits in currentByte haven't been added to bytes yet*/
                var copyBytes = bytes.slice(0)/*clone*/;
                    copyBytes.push(currentByte);
                return copyBytes;
            } else/*no addition bits have been added*/
                return bytes;
        };
    };
    var library = {
        'version': '3.0.1',
        'x86': {},
        'x64': {}
    };

    // PRIVATE FUNCTIONS
    // -----------------

    function _x86Multiply(m, n) {
        //
        // Given two 32bit ints, returns the two multiplied together as a
        // 32bit int.
        //

        return ((m & 0xffff) * n) + ((((m >>> 16) * n) & 0xffff) << 16);
    }

    function _x86Rotl(m, n) {
        //
        // Given a 32bit int and an int representing a number of bit positions,
        // returns the 32bit int rotated left by that number of positions.
        //

        return (m << n) | (m >>> (32 - n));
    }

    function _x86Fmix(h) {
        //
        // Given a block, returns murmurHash3's final x86 mix of that block.
        //

        h ^= h >>> 16;
        h = _x86Multiply(h, 0x85ebca6b);
        h ^= h >>> 13;
        h = _x86Multiply(h, 0xc2b2ae35);
        h ^= h >>> 16;

        return h;
    }

    function _x64Add(m, n) {
        //
        // Given two 64bit ints (as an array of two 32bit ints) returns the two
        // added together as a 64bit int (as an array of two 32bit ints).
        //

        m = [m[0] >>> 16, m[0] & 0xffff, m[1] >>> 16, m[1] & 0xffff];
        n = [n[0] >>> 16, n[0] & 0xffff, n[1] >>> 16, n[1] & 0xffff];
        var o = [0, 0, 0, 0];

        o[3] += m[3] + n[3];
        o[2] += o[3] >>> 16;
        o[3] &= 0xffff;

        o[2] += m[2] + n[2];
        o[1] += o[2] >>> 16;
        o[2] &= 0xffff;

        o[1] += m[1] + n[1];
        o[0] += o[1] >>> 16;
        o[1] &= 0xffff;

        o[0] += m[0] + n[0];
        o[0] &= 0xffff;

        return [(o[0] << 16) | o[1], (o[2] << 16) | o[3]];
    }

    function _x64Multiply(m, n) {
        //
        // Given two 64bit ints (as an array of two 32bit ints) returns the two
        // multiplied together as a 64bit int (as an array of two 32bit ints).
        //

        m = [m[0] >>> 16, m[0] & 0xffff, m[1] >>> 16, m[1] & 0xffff];
        n = [n[0] >>> 16, n[0] & 0xffff, n[1] >>> 16, n[1] & 0xffff];
        var o = [0, 0, 0, 0];

        o[3] += m[3] * n[3];
        o[2] += o[3] >>> 16;
        o[3] &= 0xffff;

        o[2] += m[2] * n[3];
        o[1] += o[2] >>> 16;
        o[2] &= 0xffff;

        o[2] += m[3] * n[2];
        o[1] += o[2] >>> 16;
        o[2] &= 0xffff;

        o[1] += m[1] * n[3];
        o[0] += o[1] >>> 16;
        o[1] &= 0xffff;

        o[1] += m[2] * n[2];
        o[0] += o[1] >>> 16;
        o[1] &= 0xffff;

        o[1] += m[3] * n[1];
        o[0] += o[1] >>> 16;
        o[1] &= 0xffff;

        o[0] += (m[0] * n[3]) + (m[1] * n[2]) + (m[2] * n[1]) + (m[3] * n[0]);
        o[0] &= 0xffff;

        return [(o[0] << 16) | o[1], (o[2] << 16) | o[3]];
    }

    function _x64Rotl(m, n) {
        //
        // Given a 64bit int (as an array of two 32bit ints) and an int
        // representing a number of bit positions, returns the 64bit int (as an
        // array of two 32bit ints) rotated left by that number of positions.
        //

        n %= 64;

        if (n === 32) {
            return [m[1], m[0]];
        } else if (n < 32) {
            return [(m[0] << n) | (m[1] >>> (32 - n)), (m[1] << n) | (m[0] >>> (32 - n))];
        } else {
            n -= 32;
            return [(m[1] << n) | (m[0] >>> (32 - n)), (m[0] << n) | (m[1] >>> (32 - n))];
        }
    }

    function _x64LeftShift(m, n) {
        //
        // Given a 64bit int (as an array of two 32bit ints) and an int
        // representing a number of bit positions, returns the 64bit int (as an
        // array of two 32bit ints) shifted left by that number of positions.
        //

        n %= 64;

        if (n === 0) {
            return m;
        } else if (n < 32) {
            return [(m[0] << n) | (m[1] >>> (32 - n)), m[1] << n];
        } else {
            return [m[1] << (n - 32), 0];
        }
    }

    function _x64Xor(m, n) {
        //
        // Given two 64bit ints (as an array of two 32bit ints) returns the two
        // xored together as a 64bit int (as an array of two 32bit ints).
        //

        return [m[0] ^ n[0], m[1] ^ n[1]];
    }

    function _x64Fmix(h) {
        //
        // Given a block, returns murmurHash3's final x64 mix of that block.
        // (`[0, h[0] >>> 1]` is a 33 bit unsigned right shift. This is the
        // only place where we need to right shift 64bit ints.)
        //

        h = _x64Xor(h, [0, h[0] >>> 1]);
        h = _x64Multiply(h, [0xff51afd7, 0xed558ccd]);
        h = _x64Xor(h, [0, h[0] >>> 1]);
        h = _x64Multiply(h, [0xc4ceb9fe, 0x1a85ec53]);
        h = _x64Xor(h, [0, h[0] >>> 1]);

        return h;
    }

    // PUBLIC FUNCTIONS
    // ----------------

    library.x86.hash32 = function (key, seed) {
        //
        // Given a string and an optional seed as an int, returns a 32 bit hash
        // using the x86 flavor of MurmurHash3, as an unsigned int.
        //

        key = key || '';
        seed = seed || 0;

        var remainder = key.length % 4;
        var bytes = key.length - remainder;

        var h1 = seed;

        var k1 = 0;

        var c1 = 0xcc9e2d51;
        var c2 = 0x1b873593;

        for (var i = 0; i < bytes; i = i + 4) {
            k1 = ((key.charCodeAt(i) & 0xff)) | ((key.charCodeAt(i + 1) & 0xff) << 8) | ((key.charCodeAt(i + 2) & 0xff) << 16) | ((key.charCodeAt(i + 3) & 0xff) << 24);

            k1 = _x86Multiply(k1, c1);
            k1 = _x86Rotl(k1, 15);
            k1 = _x86Multiply(k1, c2);

            h1 ^= k1;
            h1 = _x86Rotl(h1, 13);
            h1 = _x86Multiply(h1, 5) + 0xe6546b64;
        }

        k1 = 0;

        switch (remainder) {
            case 3:
                k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16;

            case 2:
                k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8;

            case 1:
                k1 ^= (key.charCodeAt(i) & 0xff);
                k1 = _x86Multiply(k1, c1);
                k1 = _x86Rotl(k1, 15);
                k1 = _x86Multiply(k1, c2);
                h1 ^= k1;
        }

        h1 ^= key.length;
        h1 = _x86Fmix(h1);

        return h1 >>> 0;
    };

    library.x86.hash128 = function (key, seed) {
        //
        // Given a string and an optional seed as an int, returns a 128 bit
        // hash using the x86 flavor of MurmurHash3, as an unsigned hex.
        //

        key = key || '';
        seed = seed || 0;

        var remainder = key.length % 16;
        var bytes = key.length - remainder;

        var h1 = seed;
        var h2 = seed;
        var h3 = seed;
        var h4 = seed;

        var k1 = 0;
        var k2 = 0;
        var k3 = 0;
        var k4 = 0;

        var c1 = 0x239b961b;
        var c2 = 0xab0e9789;
        var c3 = 0x38b34ae5;
        var c4 = 0xa1e38b93;

        for (var i = 0; i < bytes; i = i + 16) {
            k1 = ((key.charCodeAt(i) & 0xff)) | ((key.charCodeAt(i + 1) & 0xff) << 8) | ((key.charCodeAt(i + 2) & 0xff) << 16) | ((key.charCodeAt(i + 3) & 0xff) << 24);
            k2 = ((key.charCodeAt(i + 4) & 0xff)) | ((key.charCodeAt(i + 5) & 0xff) << 8) | ((key.charCodeAt(i + 6) & 0xff) << 16) | ((key.charCodeAt(i + 7) & 0xff) << 24);
            k3 = ((key.charCodeAt(i + 8) & 0xff)) | ((key.charCodeAt(i + 9) & 0xff) << 8) | ((key.charCodeAt(i + 10) & 0xff) << 16) | ((key.charCodeAt(i + 11) & 0xff) << 24);
            k4 = ((key.charCodeAt(i + 12) & 0xff)) | ((key.charCodeAt(i + 13) & 0xff) << 8) | ((key.charCodeAt(i + 14) & 0xff) << 16) | ((key.charCodeAt(i + 15) & 0xff) << 24);

            k1 = _x86Multiply(k1, c1);
            k1 = _x86Rotl(k1, 15);
            k1 = _x86Multiply(k1, c2);
            h1 ^= k1;

            h1 = _x86Rotl(h1, 19);
            h1 += h2;
            h1 = _x86Multiply(h1, 5) + 0x561ccd1b;

            k2 = _x86Multiply(k2, c2);
            k2 = _x86Rotl(k2, 16);
            k2 = _x86Multiply(k2, c3);
            h2 ^= k2;

            h2 = _x86Rotl(h2, 17);
            h2 += h3;
            h2 = _x86Multiply(h2, 5) + 0x0bcaa747;

            k3 = _x86Multiply(k3, c3);
            k3 = _x86Rotl(k3, 17);
            k3 = _x86Multiply(k3, c4);
            h3 ^= k3;

            h3 = _x86Rotl(h3, 15);
            h3 += h4;
            h3 = _x86Multiply(h3, 5) + 0x96cd1c35;

            k4 = _x86Multiply(k4, c4);
            k4 = _x86Rotl(k4, 18);
            k4 = _x86Multiply(k4, c1);
            h4 ^= k4;

            h4 = _x86Rotl(h4, 13);
            h4 += h1;
            h4 = _x86Multiply(h4, 5) + 0x32ac3b17;
        }

        k1 = 0;
        k2 = 0;
        k3 = 0;
        k4 = 0;

        switch (remainder) {
            case 15:
                k4 ^= key.charCodeAt(i + 14) << 16;

            case 14:
                k4 ^= key.charCodeAt(i + 13) << 8;

            case 13:
                k4 ^= key.charCodeAt(i + 12);
                k4 = _x86Multiply(k4, c4);
                k4 = _x86Rotl(k4, 18);
                k4 = _x86Multiply(k4, c1);
                h4 ^= k4;

            case 12:
                k3 ^= key.charCodeAt(i + 11) << 24;

            case 11:
                k3 ^= key.charCodeAt(i + 10) << 16;

            case 10:
                k3 ^= key.charCodeAt(i + 9) << 8;

            case 9:
                k3 ^= key.charCodeAt(i + 8);
                k3 = _x86Multiply(k3, c3);
                k3 = _x86Rotl(k3, 17);
                k3 = _x86Multiply(k3, c4);
                h3 ^= k3;

            case 8:
                k2 ^= key.charCodeAt(i + 7) << 24;

            case 7:
                k2 ^= key.charCodeAt(i + 6) << 16;

            case 6:
                k2 ^= key.charCodeAt(i + 5) << 8;

            case 5:
                k2 ^= key.charCodeAt(i + 4);
                k2 = _x86Multiply(k2, c2);
                k2 = _x86Rotl(k2, 16);
                k2 = _x86Multiply(k2, c3);
                h2 ^= k2;

            case 4:
                k1 ^= key.charCodeAt(i + 3) << 24;

            case 3:
                k1 ^= key.charCodeAt(i + 2) << 16;

            case 2:
                k1 ^= key.charCodeAt(i + 1) << 8;

            case 1:
                k1 ^= key.charCodeAt(i);
                k1 = _x86Multiply(k1, c1);
                k1 = _x86Rotl(k1, 15);
                k1 = _x86Multiply(k1, c2);
                h1 ^= k1;
        }

        h1 ^= key.length;
        h2 ^= key.length;
        h3 ^= key.length;
        h4 ^= key.length;

        h1 += h2;
        h1 += h3;
        h1 += h4;
        h2 += h1;
        h3 += h1;
        h4 += h1;

        h1 = _x86Fmix(h1);
        h2 = _x86Fmix(h2);
        h3 = _x86Fmix(h3);
        h4 = _x86Fmix(h4);

        h1 += h2;
        h1 += h3;
        h1 += h4;
        h2 += h1;
        h3 += h1;
        h4 += h1;

        return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0]
        return ("00000000" + (h1 >>> 0).toString(16)).slice(-8) + ("00000000" + (h2 >>> 0).toString(16)).slice(-8) + ("00000000" + (h3 >>> 0).toString(16)).slice(-8) + ("00000000" + (h4 >>> 0).toString(16)).slice(-8);
    };

    library.x64.hash128 = function (key, seed) {
        //
        // Given a string and an optional seed as an int, returns a 128 bit
        // hash using the x64 flavor of MurmurHash3, as an unsigned hex.
        //

        key = key || '';
        seed = seed || 0;

        var remainder = key.length % 16;
        var bytes = key.length - remainder;

        var h1 = [0, seed];
        var h2 = [0, seed];

        var k1 = [0, 0];
        var k2 = [0, 0];

        var c1 = [0x87c37b91, 0x114253d5];
        var c2 = [0x4cf5ad43, 0x2745937f];

        for (var i = 0; i < bytes; i = i + 16) {
            k1 = [((key.charCodeAt(i + 4) & 0xff)) | ((key.charCodeAt(i + 5) & 0xff) << 8) | ((key.charCodeAt(i + 6) & 0xff) << 16) | ((key.charCodeAt(i + 7) & 0xff) << 24), ((key.charCodeAt(i) & 0xff)) | ((key.charCodeAt(i + 1) &
                0xff) << 8) | ((key.charCodeAt(i + 2) & 0xff) << 16) | ((key.charCodeAt(i + 3) & 0xff) << 24)];
            k2 = [((key.charCodeAt(i + 12) & 0xff)) | ((key.charCodeAt(i + 13) & 0xff) << 8) | ((key.charCodeAt(i + 14) & 0xff) << 16) | ((key.charCodeAt(i + 15) & 0xff) << 24), ((key.charCodeAt(i + 8) & 0xff)) | ((key.charCodeAt(i +
                9) & 0xff) << 8) | ((key.charCodeAt(i + 10) & 0xff) << 16) | ((key.charCodeAt(i + 11) & 0xff) << 24)];

            k1 = _x64Multiply(k1, c1);
            k1 = _x64Rotl(k1, 31);
            k1 = _x64Multiply(k1, c2);
            h1 = _x64Xor(h1, k1);

            h1 = _x64Rotl(h1, 27);
            h1 = _x64Add(h1, h2);
            h1 = _x64Add(_x64Multiply(h1, [0, 5]), [0, 0x52dce729]);

            k2 = _x64Multiply(k2, c2);
            k2 = _x64Rotl(k2, 33);
            k2 = _x64Multiply(k2, c1);
            h2 = _x64Xor(h2, k2);

            h2 = _x64Rotl(h2, 31);
            h2 = _x64Add(h2, h1);
            h2 = _x64Add(_x64Multiply(h2, [0, 5]), [0, 0x38495ab5]);
        }

        k1 = [0, 0];
        k2 = [0, 0];

        switch (remainder) {
            case 15:
                k2 = _x64Xor(k2, _x64LeftShift([0, key.charCodeAt(i + 14)], 48));

            case 14:
                k2 = _x64Xor(k2, _x64LeftShift([0, key.charCodeAt(i + 13)], 40));

            case 13:
                k2 = _x64Xor(k2, _x64LeftShift([0, key.charCodeAt(i + 12)], 32));

            case 12:
                k2 = _x64Xor(k2, _x64LeftShift([0, key.charCodeAt(i + 11)], 24));

            case 11:
                k2 = _x64Xor(k2, _x64LeftShift([0, key.charCodeAt(i + 10)], 16));

            case 10:
                k2 = _x64Xor(k2, _x64LeftShift([0, key.charCodeAt(i + 9)], 8));

            case 9:
                k2 = _x64Xor(k2, [0, key.charCodeAt(i + 8)]);
                k2 = _x64Multiply(k2, c2);
                k2 = _x64Rotl(k2, 33);
                k2 = _x64Multiply(k2, c1);
                h2 = _x64Xor(h2, k2);

            case 8:
                k1 = _x64Xor(k1, _x64LeftShift([0, key.charCodeAt(i + 7)], 56));

            case 7:
                k1 = _x64Xor(k1, _x64LeftShift([0, key.charCodeAt(i + 6)], 48));

            case 6:
                k1 = _x64Xor(k1, _x64LeftShift([0, key.charCodeAt(i + 5)], 40));

            case 5:
                k1 = _x64Xor(k1, _x64LeftShift([0, key.charCodeAt(i + 4)], 32));

            case 4:
                k1 = _x64Xor(k1, _x64LeftShift([0, key.charCodeAt(i + 3)], 24));

            case 3:
                k1 = _x64Xor(k1, _x64LeftShift([0, key.charCodeAt(i + 2)], 16));

            case 2:
                k1 = _x64Xor(k1, _x64LeftShift([0, key.charCodeAt(i + 1)], 8));

            case 1:
                k1 = _x64Xor(k1, [0, key.charCodeAt(i)]);
                k1 = _x64Multiply(k1, c1);
                k1 = _x64Rotl(k1, 31);
                k1 = _x64Multiply(k1, c2);
                h1 = _x64Xor(h1, k1);
        }

        h1 = _x64Xor(h1, [0, key.length]);
        h2 = _x64Xor(h2, [0, key.length]);

        h1 = _x64Add(h1, h2);
        h2 = _x64Add(h2, h1);

        h1 = _x64Fmix(h1);
        h2 = _x64Fmix(h2);

        h1 = _x64Add(h1, h2);
        h2 = _x64Add(h2, h1);

        return [h1[0] >>> 0, h2[0] >>> 0]
        return ("00000000" + (h1[0] >>> 0).toString(16)).slice(-8) + ("00000000" + (h1[1] >>> 0).toString(16)).slice(-8) + ("00000000" + (h2[0] >>> 0).toString(16)).slice(-8) + ("00000000" + (h2[1] >>> 0).toString(16)).slice(-8);
    };

    

})(typeof exports !== "undefined" ? exports : this);