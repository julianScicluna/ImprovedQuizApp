//Function to convert BigInts (of theoretically unlimited size) into a set of bytes, through a UInt8Array
function bigIntToUInt8Array(num = 0n, bytesFill = 0) {
    if (typeof num !== "bigint") {
        console.warn("The number which you have specified is not a BigInt. therefore, it will be casted to one");
        num = BigInt(num);
    }
    let bigIntByteMask = BigInt(0xFF);
    arr = new Uint8Array(Math.max(Math.ceil((Math.log(new Number(num) + 1)/Math.log(2))/8), bytesFill));
    for (let i = 0; i < arr.length; i++) {
        arr[i] = new Number((num >> (8n * BigInt(arr.length - i - 1))) & bigIntByteMask);
    }
    return arr;
}

//Function to convert a UInt8Array to a Big-Endian BigInt
function UInt8ArrayToBigInt(arr) {
    var num = 0n;
    for (let i = 0; i < arr.length; i++) {
        num += BigInt(arr[i]) * (256n**BigInt(arr.length - i - 1))
    }
    return num;
}

const hash = function(object = {}) {
    return 0;
}

const multiDataFormatter = {
    //Methods to parse data with or without a known template. Those which do not require a parsing template (which is similar to a C struct with fields) tend to be relatively slow, yet do not require a parsing template, hence their existence
    async encode(keysArr = [], valuesArr = [], template = {}) {
        //Validation: Check if key-value arrays are of equal length
        if (keysArr.length != valuesArr.length) {
            throw new IllegalArgumentError("The arrays storing keys and their respective values are not of equal length");
        }
        //Get the total length of all strings in keysArr
        let keysLenTotal = 0;
        for (let i = 0; i < keysArr.length; i++) {
            if (typeof keysArr[i] == "string") {
                keysLenTotal += keysArr[i].length + 1; /*Include the 00 bytes between key and 2 64-bit longs*/
            } else {
                throw new IllegalArgumentError("All indices within array 'keysArr' must be ASCII strings");
            }
        }
        //keysLenTotal includes the 0x00 control char after every key
        let keysAddressesLenTotal = 8 + keysLenTotal + (keysArr.length * 16) + 2;
        let valuesCumulativeSizes = [];
        //Get the total size of all values, which must be blobs
        for (let i = 0; i < valuesArr.length; i++) {
            if (valuesArr[i] instanceof Blob || typeof valuesArr[i] === "string") {
                if (valuesCumulativeSizes.length === 0) {
                    //Insert the first element in the array manually without depending on previous elements, for failing to do so can cause various errors and quirks involving the infamous 'NaN'
                    if (typeof valuesArr[0] === "string") {
                        valuesArr[0] = new Blob([valuesArr[0]], {type:"text/plain"});
                    }
                    valuesCumulativeSizes[0] = valuesArr[0].size;
                } else {
                    if (typeof valuesArr[i] === "string") {
                        valuesArr[i] = new Blob([valuesArr[i]], {type:"text/plain"});
                    }
                    valuesCumulativeSizes.push(valuesCumulativeSizes[valuesCumulativeSizes.length - 1] + valuesArr[i].size);
                }
            } else {
                throw new IllegalArgumentError("All indices within array 'valuesArr' must be Blobs or strings (which are internally converted into blobs)");
            }
        }
        if (valuesCumulativeSizes.length === 0) {
            //No values (and therefore no keys) - create a cumulative length of 0
            valuesCumulativeSizes.push(0);
        }
        //Get the array's total size by adding the sizes of the 64-bit template hash, keys' sizes, 0x00 control characters separating keys and values, 128-bit (2 * 64-bit (unsigned long) pointers) values, 2 successive 0x00 control characters and blob sizes
        let stringEncoder = new TextEncoder();
        let rawByteArray = new Uint8Array(keysAddressesLenTotal + valuesCumulativeSizes[valuesCumulativeSizes.length - 1]);
        const keyAddrSeparationChar = new Uint8Array([0]);
        const keyValSeparationChars = new Uint8Array([0, 0]);
        let index = 0;
        //Enter the template's 64-bit hash (for now, has no use)
        rawByteArray.set(bigIntToUInt8Array(hash(JSON.stringify(template)), 8), index);
        index += 8;
        const LONG_MAX_SIZE = 2n**64n;
        for (let i = 0; i < keysArr.length; i++) {
            let charArray = stringEncoder.encode(keysArr[i]);
            if (charArray.indexOf(0) != -1) {
                throw new IllegalArgumentError("Encoded Key has 0x00 control character inside");
            }
            //Insert key and 0x00 control character and update index accordingly
            rawByteArray.set(charArray, index);
            index += charArray.length;
            //Do NOT merge two index incrementation statements; index MUST vary between the two UInt8Array.prototype.set(ArrayLike<Number>, Number) invocations
            rawByteArray.set(keyAddrSeparationChar, index);
            index++;
            //Compute and write the 64-bit start addresses to the buffer (The address of the first byte of the data, relative to the very first byte in rawByteArray)
            if (i === 0) {
                rawByteArray.set(bigIntToUInt8Array(keysAddressesLenTotal, 8), index);
            } else {
                rawByteArray.set(bigIntToUInt8Array(keysAddressesLenTotal + valuesCumulativeSizes[i - 1], 8), index);
            }
            index += 8;
            //Compute and write the 64-bit end addresses to the buffer (The address of the first byte to ignore, relative to the very first byte in rawByteArray)
            if (i + 1 === valuesCumulativeSizes.length) {
                rawByteArray.set(bigIntToUInt8Array(rawByteArray.length, 8), index);
            } else if (i === 0) {
                rawByteArray.set(bigIntToUInt8Array(keysAddressesLenTotal + valuesCumulativeSizes[i], 8), index);
            } else {
                rawByteArray.set(bigIntToUInt8Array(keysAddressesLenTotal + valuesCumulativeSizes[i + 1], 8), index);
            }
            index += 8;
        }
        rawByteArray.set(keyValSeparationChars, index);
        index += 2;
        //Begin writing the values to the heap
        for (let i = 0; i < valuesArr.length; i++) {
            let valBuf = await (valuesArr[i].arrayBuffer());
            let valArr = new Uint8Array(valBuf);
            rawByteArray.set(valArr, index);
            index += valArr.length;
        }
        return rawByteArray;
    },
    decode(rawDataBuffer, template = "") {
        var textDecoder = new TextDecoder();
        //declare three arrays in which to store keys and two corresponding values per key, where the specified 'values' are actually the start and end addresses of the values in the ensuing bytes, relative to the beginning of the data heap. The end address is the address of the first byte to be ignored
        let keys = [], starts = [], ends = [];
        var keyValueMap = {};
        //Variable to store the index (address) of the selected byte, similar to a pointer. Relative to the very first byte of the Buffer object referenced by the argument rawDataBuffer. Set to 8 due to the possible inital 64-bit (8-byte) template hash
        let index = 8;
        //Get the address of the two bytes which define the end of the key-address mappings. Key searches should not continue beyond this point
        //var keysEndIndex = rawDataBuffer.indexOf("0000", index, "hex");
        //Assuming correct formatting (given, will include verification method), there will always come a case where the index will EQUAL the address of the first byte of the two-byte sequence denoting the end of the key-value pairs - STOP THERE!
        //Keep getting keys and values until the two consecutive 0x00 bytes have been reached. DO NOT search for them using indexOf, for they might return the 0x00 chars inside the 64-bit pointers. This way, values will always be skipped
        while (rawDataBuffer[index] + rawDataBuffer[index + 1] > 0) {
            //Get the address of the byte separating key and value. The byte (control character) 0x00 should NEVER occur in the key, however it can occur in the value, for its size is always known: 8 bytes (64 bits)
            keyEnd = rawDataBuffer.indexOf(0, index);
            //read the key and value and insert them into their respective arrays (verbose code alert: fire the numpty who did not write this in C++! Oh, right... It's me, isn't it?)
            keys.push(textDecoder.decode(rawDataBuffer.subarray(index, keyEnd)));
            starts.push(UInt8ArrayToBigInt(rawDataBuffer.subarray(keyEnd + 1, keyEnd + 9)));
            ends.push(UInt8ArrayToBigInt(rawDataBuffer.subarray(keyEnd + 9, keyEnd + 17))); //The ninth byte relative to keyEnd is the first one; seven to go to make up eight; 9 + 7 = 16
            //Go to the next key (2 * 64-bit (unsigned) longs = 128 bits. 128/8 = 16 bytes), plus one to leave the 0x00 control character
            index = keyEnd + 17;
        };

        //Perform merge sort/quicksort to get addresses in ascending order
        //quicksortParallel([keys, values], values);

        //Convert the addresses into values, perhaps by storing the key-value pairs using back-to-back arrays, due to guaranteed ordering
        for (let i = 0; i < keys.length; i++) {
            keyValueMap[keys[i]] = rawDataBuffer.subarray(Number(starts[i]), Number(ends[i]));
        }
        return keyValueMap;
    }
}